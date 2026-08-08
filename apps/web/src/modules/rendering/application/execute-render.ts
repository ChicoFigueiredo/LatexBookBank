import type { RenderBundle } from "@latexbookbank/render-contract";

import type { RenderExecutor, StorageProvider } from "@/shared/ports";

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
}

export async function executeRender(
  input: ExecuteRenderInput,
  deps: ExecuteRenderDeps,
): Promise<ExecuteRenderResult> {
  const contentHash = await renderContentHash(input.bundle, deps.rendererVersion);

  const cached = await deps.jobs.findByContentHash(input.workspaceId, contentHash);
  if (cached !== null) {
    // Job que falhou também é cache: recompilar o mesmo LaTeX quebrado dá o mesmo erro, e gastar
    // três segundos de `pdflatex` para reconfirmar isso é desperdício que a pessoa sente.
    return { job: cached, cacheHit: true };
  }

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

  return { job: await deps.jobs.create(job), cacheHit: false };
}
