import type { RenderBundle } from "@latexbookbank/render-contract";

import type { RenderExecutor, StorageProvider } from "@/shared/ports";

import { logger as defaultLogger, type Logger } from "@/shared/observability/logger";

import { renderContentHash } from "../domain/content-hash";
import {
  truncateLog,
  type NewRenderJob,
  type RenderArtifactRecord,
  type RenderJobRecord,
  type RenderJobRepository,
} from "../domain/render-job";

/**
 * Compila — ou devolve o que já foi compilado.
 *
 * Este é o único caminho entre o produto e o `pdflatex`. Módulos editoriais chamam isto; nenhum
 * deles conhece o worker, o storage ou o formato do bundle.
 *
 * A ordem das três operações é o que garante que não sobre lixo:
 *
 * 1. **hash** → se já existe, acabou;
 * 2. **compila** → o worker devolve bytes;
 * 3. **grava no storage e só então no banco.**
 *
 * Inverter 3 criaria linha apontando para chave que não existe — e uma linha assim é pior que
 * nenhuma, porque a interface acha que tem PDF e o download falha. Na ordem certa, uma falha
 * entre gravar o arquivo e gravar a linha deixa no máximo um arquivo órfão, que é reconstruível e
 * some na próxima limpeza (D29).
 */

export interface ExecuteRenderInput {
  readonly workspaceId: string;
  readonly questionId: string | null;
  readonly bundle: RenderBundle;
  readonly assets?: ReadonlyMap<string, Uint8Array>;
}

export interface ExecuteRenderResult {
  readonly job: RenderJobRecord;
  /**
   * `true` quando nada foi compilado.
   *
   * Vai para a interface: sem isso, um render instantâneo pareceria falha de atualização, e a
   * pessoa clicaria de novo achando que não pegou.
   */
  readonly cacheHit: boolean;
}

export interface ExecuteRenderDeps {
  readonly executor: RenderExecutor;
  readonly storage: StorageProvider;
  readonly jobs: RenderJobRepository;
  readonly rendererVersion: string;
  /**
   * Onde os eventos vão. Injetável, e por isso o teste consegue afirmar **o que** foi registrado.
   *
   * Este é o único ponto entre o produto e o `pdflatex`, então é aqui que uma linha de log paga:
   * instrumentar as rotas daria o mesmo evento contado de N lugares, e nenhum deles saberia se
   * houve cache.
   */
  readonly logger?: Logger;
}

export async function executeRender(
  input: ExecuteRenderInput,
  deps: ExecuteRenderDeps,
): Promise<ExecuteRenderResult> {
  const log = deps.logger ?? defaultLogger;
  const contentHash = await renderContentHash(input.bundle, deps.rendererVersion);
  // O hash abreviado, não o LaTeX: o log é para correlacionar, e o enunciado de uma prova não
  // tem por que existir em duas cópias, uma delas fora do banco (spec §14).
  const hash = contentHash.slice(0, 12);

  const cached = await deps.jobs.findByContentHash(input.workspaceId, contentHash);
  if (cached !== null) {
    // Job que falhou também é cache: recompilar o mesmo LaTeX quebrado dá o mesmo erro, e gastar
    // três segundos de `pdflatex` para reconfirmar isso é desperdício que a pessoa sente.
    log.info("render", "cache_hit", { hash, jobId: cached.id, success: cached.success });
    return { job: cached, cacheHit: true };
  }

  log.info("render", "started", { hash, profileId: input.bundle.profile.id });

  const { result, artifacts } = await deps.executor.render(input.bundle, input.assets);

  const stored: RenderArtifactRecord[] = [];
  const descriptors = [...(result.pdf ? [result.pdf] : []), ...result.png];

  for (const descriptor of descriptors) {
    const bytes = artifacts.get(descriptor.name);
    if (bytes === undefined) continue;

    const asset = await deps.storage.put({
      workspaceId: input.workspaceId,
      content: bytes,
      mimeType: descriptor.mimeType,
      originalFilename: descriptor.name,
    });

    stored.push({
      kind: descriptor.mimeType === "application/pdf" ? "RENDER_PDF" : "RENDER_PNG",
      storageKey: asset.storageKey,
      mimeType: descriptor.mimeType,
      sizeBytes: asset.sizeBytes,
      // O hash vem do **storage**, não do descritor do worker: é o que garante que o registro
      // descreve o que foi gravado, e não o que se esperava gravar.
      sha256: asset.sha256,
      width: descriptor.width,
      height: descriptor.height,
      name: descriptor.name,
    });
  }

  const job: NewRenderJob = {
    workspaceId: input.workspaceId,
    questionId: input.questionId,
    contentHash,
    profileId: input.bundle.profile.id,
    rendererVersion: result.rendererVersion,
    state: result.success ? "DONE" : "FAILED",
    success: result.success,
    durationMs: result.durationMs,
    diagnostics: result.diagnostics,
    stdout: truncateLog(result.stdout),
    stderr: truncateLog(result.stderr),
    artifacts: stored,
  };

  const created = await deps.jobs.create(job);

  // `warn` quando falhou, e não `error`: LaTeX quebrado é trabalho em andamento de quem escreve,
  // não defeito do produto. Guardar os dois no mesmo nível faria o log de erros virar a lista de
  // rascunhos de alguém.
  log[result.success ? "info" : "warn"]("render", "finished", {
    hash,
    jobId: created.id,
    success: result.success,
    durationMs: result.durationMs,
    artifacts: stored.length,
    diagnostics: result.diagnostics.length,
  });

  return { job: created, cacheHit: false };
}
