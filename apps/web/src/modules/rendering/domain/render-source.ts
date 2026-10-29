import type { RenderBundle } from "@latexbookbank/render-contract";

import type { QuestionForRender } from "./build-render-bundle";

/**
 * O que se compila, e de onde vêm as figuras que o corpo cita.
 *
 * Uma questão e o corpo de um nó compilam pelo mesmo caminho: o corpo do nó entra como enunciado
 * de uma discursiva. O que muda entre os dois é só **a quem as figuras pertencem** — à questão, ou
 * ao livro (D58) —, e por isso a fonte traz o próprio `loadAssets`.
 *
 * As figuras são resolvidas **depois** de montado o corpo, e a partir dele: só o que o LaTeX cita
 * viaja, e para saber o que ele cita é preciso já ter o corpo. Ver `assembleBundle`.
 */
export interface RenderSource {
  readonly workspaceId: string;
  /** `null` no corpo de nó: o `RenderJob` dele não tem questão. */
  readonly questionId: string | null;
  readonly document: QuestionForRender;
  /** As figuras que **este** corpo cita, com os bytes. */
  readonly loadAssets: (sourceLatex: string) => Promise<ResolvedAssets>;
}

/** As figuras prontas para viajar: o manifesto vai no bundle, os bytes no multipart (D35). */
export interface ResolvedAssets {
  readonly manifest: RenderBundle["assets"];
  readonly bytes: ReadonlyMap<string, Uint8Array>;
}

/** Os campos de texto que um candidato pode substituir na compilação. */
export const LATEX_FIELDS = ["statementLatex", "solutionLatex", "complementLatex"] as const;
export type LatexField = (typeof LATEX_FIELDS)[number];

export const isLatexField = (value: unknown): value is LatexField =>
  typeof value === "string" && (LATEX_FIELDS as readonly string[]).includes(value);
