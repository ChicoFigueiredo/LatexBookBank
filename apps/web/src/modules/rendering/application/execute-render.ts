import type { RenderBundle } from "@latexbookbank/render-contract";

import { asStorageKey, type RenderExecutor, type StorageProvider } from "@/shared/ports";

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
  /** Recompila mesmo com cache, e o resultado novo passa a ser o cache. */
  readonly force?: boolean;
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
  /**
   * A versão de quem compila — entra no hash de cache.
   *
   * Função quando vem do worker (`/health`): é a imagem que compila quem sabe se mudou, e a versão
   * lida do ambiente da aplicação só mudava quando alguém lembrava de mudá-la.
   */
  readonly rendererVersion: string | (() => Promise<string>);
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
  const rendererVersion =
    typeof deps.rendererVersion === "string" ? deps.rendererVersion : await deps.rendererVersion();
  const contentHash = await renderContentHash(input.bundle, rendererVersion);
  // O hash abreviado, não o LaTeX: o log é para correlacionar, e o enunciado de uma prova não
  // tem por que existir em duas cópias, uma delas fora do banco (spec §14).
  const hash = contentHash.slice(0, 12);

  const cached = await deps.jobs.findByContentHash(input.workspaceId, contentHash);
  if (cached !== null) {
    // Job que falhou também é cache — só falha **do documento** chega a ser gravada, e recompilar
    // o mesmo LaTeX quebrado dá o mesmo erro.
    //
    // Mas o cache só vale enquanto for verdade. Um artefato descartado do storage (D29) faria a
    // tela achar que tem PDF e o download falhar, e o conselho "recompile" daria cache hit no
    // mesmo job; quem pede `force` quer justamente não ler o cache.
    const stale = input.force === true || !(await artifactsExist(cached, deps.storage));
    if (!stale) {
      log.info("render", "cache_hit", { hash, jobId: cached.id, success: cached.success });
      return { job: cached, cacheHit: true };
    }

    log.info("render", "cache_dropped", { hash, jobId: cached.id, forced: input.force === true });
    await deps.jobs.remove(cached.id);
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

  // Falha que não é do documento — prazo estourado, worker com defeito — é do momento, e não vai
  // para o cache: a próxima compilação tenta de novo. O worker sem `failureKind` é anterior ao
  // campo, e a leitura dele continua a de antes.
  const failureKind = result.success ? null : (result.failureKind ?? "document");
  const cacheable = failureKind === null || failureKind === "document";

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

  if (!cacheable) {
    log.warn("render", "transient_failure", {
      hash,
      failureKind,
      durationMs: result.durationMs,
      diagnostics: result.diagnostics.length,
    });
    // O id é o da execução: não há linha no banco, e não há artefato para baixar por ele.
    return { job: { ...job, id: input.bundle.jobId }, cacheHit: false };
  }

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

/** Todos os artefatos do job ainda estão no storage? */
async function artifactsExist(job: RenderJobRecord, storage: StorageProvider): Promise<boolean> {
  for (const artifact of job.artifacts) {
    if (!(await storage.exists(asStorageKey(artifact.storageKey)))) return false;
  }
  return true;
}
