import type { RenderBundle, RenderProfile } from "@latexbookbank/render-contract";

import type { RenderExecutor, RenderOutcome } from "@/shared/ports";

import {
  buildRenderBundle,
  buildSourceMap,
  type BuildBundleInput,
  type RenderSourceSpan,
} from "../domain/build-render-bundle";
import type { LatexField, RenderSource } from "../domain/render-source";
import { executeRender, type ExecuteRenderDeps, type ExecuteRenderResult } from "./execute-render";

/**
 * Compilar uma questão, um candidato ou o corpo de um nó — **um** caminho só.
 *
 * As rotas e a tool do agente montavam o bundle cada uma do seu jeito, e duas delas compilavam sem
 * as figuras: o candidato da revisão e o `render_candidate_latex` diziam "File not found" em toda
 * questão com `\includegraphics`, e o modelo gastava as três tentativas "corrigindo" o que não
 * estava errado. Aqui a fonte é resolvida, o corpo é montado, as figuras que ele cita entram, e o
 * pedido de cancelamento chega ao worker — para os três.
 *
 * Dois desfechos, e a diferença entre eles é **persistir**:
 *
 * - `renderDocument` grava `RenderJob` e artefatos, com cache por hash (o editor);
 * - `compileDraft` só compila e devolve bytes e diagnósticos (o candidato e o agente). Proposta
 *   que talvez seja rejeitada não tem por que encher o banco, e o agente não ganha por aqui um
 *   caminho indireto de escrita.
 *
 * Ver spec §35 · D35 · D58 · issue #265.
 */

export interface RenderRequest {
  readonly profile: RenderProfile;
  readonly includeSolution?: boolean;
  /** O candidato: campos que substituem os da fonte só nesta compilação. */
  readonly overrides?: Partial<Record<LatexField, string>>;
  /** Quando quem pediu desiste, o worker também para — ver `cancelOnAbort`. */
  readonly signal?: AbortSignal;
  /** Recompila mesmo com cache (só `renderDocument`; o rascunho nunca usa cache). */
  readonly force?: boolean;
}

export interface AssembledBundle {
  readonly bundle: RenderBundle;
  /** Os bytes das figuras citadas, por nome no bundle. */
  readonly assets: ReadonlyMap<string, Uint8Array>;
  /** Onde, nos campos do editor, cada linha do corpo nasceu. */
  readonly sourceMap: readonly RenderSourceSpan[];
}

/**
 * O bundle, com as figuras que o corpo cita.
 *
 * Duas passadas de propósito: o corpo primeiro, as figuras depois. Só o que o LaTeX **cita**
 * viaja, e para saber o que ele cita é preciso já ter o corpo montado — com o candidato aplicado,
 * porque um candidato pode citar uma figura que o texto salvo não cita. Mandar tudo engordaria cada
 * compilação com arquivos que o documento não usa, e o PDF de origem de um recorte tem megabytes.
 *
 * É **o** ponto onde o bundle junta os assets: quem precisar que outra figura viaje muda a fonte
 * (`RenderSource.loadAssets`), não este laço.
 */
export async function assembleBundle(
  source: RenderSource,
  request: RenderRequest,
  jobId: string,
): Promise<AssembledBundle> {
  const input: BuildBundleInput = {
    jobId,
    question: { ...source.document, ...request.overrides },
    profile: request.profile,
    ...(request.includeSolution === true ? { includeSolution: true } : {}),
  };

  const body = buildRenderBundle(input);
  const assets = await source.loadAssets(body.sourceLatex);

  return {
    bundle: buildRenderBundle({ ...input, assets: assets.manifest }),
    assets: assets.bytes,
    sourceMap: buildSourceMap(input),
  };
}

export interface RenderDocumentResult extends ExecuteRenderResult {
  /** O corpo que foi realmente enviado — a aba Fonte mostra este, não uma reconstrução. */
  readonly sourceLatex: string;
  readonly sourceMap: readonly RenderSourceSpan[];
}

/** Compila e guarda — ou devolve o que já foi compilado. */
export async function renderDocument(
  deps: ExecuteRenderDeps,
  source: RenderSource,
  request: RenderRequest,
): Promise<RenderDocumentResult> {
  // O `jobId` é da execução e **não** entra no hash de cache — ver `content-hash.ts`.
  const assembled = await assembleBundle(source, request, crypto.randomUUID());
  const stop = cancelOnAbort(deps.executor, assembled.bundle.jobId, request.signal);

  try {
    const outcome = await executeRender(
      {
        workspaceId: source.workspaceId,
        questionId: source.questionId,
        bundle: assembled.bundle,
        assets: assembled.assets,
        ...(request.force === true ? { force: true } : {}),
      },
      deps,
    );
    return {
      ...outcome,
      sourceLatex: assembled.bundle.sourceLatex,
      sourceMap: assembled.sourceMap,
    };
  } finally {
    stop();
  }
}

export interface CompileDraftResult extends RenderOutcome {
  readonly sourceLatex: string;
}

/** Compila para **conferir**: nada é gravado, e os bytes morrem com quem pediu. */
export async function compileDraft(
  deps: { readonly executor: RenderExecutor },
  source: RenderSource,
  request: RenderRequest,
): Promise<CompileDraftResult> {
  // Um id por compilação, nunca derivado do campo ou da tentativa: o antes e o depois da revisão
  // compilam em paralelo, e dois turnos do agente também, e o worker guarda o job pelo id. Um id
  // repetido trocava os artefatos de um pelos do outro (SEC-07, PLT-12).
  const assembled = await assembleBundle(source, request, `draft-${crypto.randomUUID()}`);
  const stop = cancelOnAbort(deps.executor, assembled.bundle.jobId, request.signal);

  try {
    const outcome = await deps.executor.render(assembled.bundle, assembled.assets);
    return { ...outcome, sourceLatex: assembled.bundle.sourceLatex };
  } finally {
    stop();
  }
}

/**
 * Quando quem pediu desiste — outra compilação foi pedida por cima desta —, o worker precisa
 * saber. Desistir só do lado de cá deixaria o `pdflatex` rodando até o fim para produzir algo que
 * ninguém vai ler, atrasando o pedido que **substituiu** este.
 *
 * O listener sai no fim: um por requisição que nunca sai vazaria memória num servidor que atende
 * milhares.
 */
function cancelOnAbort(
  executor: RenderExecutor,
  jobId: string,
  signal: AbortSignal | undefined,
): () => void {
  if (signal === undefined) return () => {};

  const cancel = (): void => void executor.cancel(jobId);
  signal.addEventListener("abort", cancel, { once: true });
  return () => signal.removeEventListener("abort", cancel);
}
