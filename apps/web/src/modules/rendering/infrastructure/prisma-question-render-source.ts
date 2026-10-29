import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";
import type { QuestionForRender } from "@modules/rendering/domain/build-render-bundle";
import type { RenderSource } from "@modules/rendering/domain/render-source";
import type { StorageProvider } from "@/shared/ports";

import { loadPublicationAssets, loadQuestionAssets } from "./prisma-question-assets";

/**
 * A questão como fonte de compilação: o texto do banco e as figuras **da questão**.
 *
 * `null` quando a questão não existe ou está fora de árvore — não há workspace onde gravar.
 */
export async function questionRenderSource(
  questionId: string,
  storage: StorageProvider,
): Promise<RenderSource | null> {
  const loaded = await loadQuestionForRender(questionId);
  if (loaded === null) return null;

  return {
    workspaceId: loaded.workspaceId,
    questionId,
    document: loaded.question,
    loadAssets: (sourceLatex) => loadQuestionAssets(questionId, sourceLatex, storage),
  };
}

/**
 * O corpo de um nó como fonte (ADR 0001: "um capítulo com corpo é compilável").
 *
 * O corpo entra no lugar do enunciado de uma discursiva, sem alternativas nem resolução. As
 * figuras são **do livro** (D58): entram no acervo antes de existir questão nenhuma.
 */
export function nodeRenderSource(
  node: { readonly nodeId: string; readonly bodyLatex: string },
  publication: { readonly id: string; readonly workspaceId: string },
  storage: StorageProvider,
): RenderSource {
  return {
    workspaceId: publication.workspaceId,
    questionId: null,
    document: {
      id: node.nodeId,
      type: "DISCURSIVE",
      statementLatex: node.bodyLatex,
      solutionLatex: "",
      complementLatex: "",
      options: [],
    },
    loadAssets: (sourceLatex) => loadPublicationAssets(publication.id, sourceLatex, storage),
  };
}

/**
 * A questão e o workspace a que ela pertence.
 *
 * O `workspaceId` não está na questão: ele vem do nó da árvore → publicação → workspace. Subir a
 * cadeia aqui é o que permite ao caso de uso receber o workspace pronto — e o workspace importa
 * porque é o prefixo do storage e o escopo do cache.
 */
export interface QuestionRenderSource {
  readonly workspaceId: string;
  readonly question: QuestionForRender;
}

export async function loadQuestionForRender(
  questionId: string,
): Promise<QuestionRenderSource | null> {
  const row = await prisma.question.findUnique({
    where: { id: questionId },
    select: {
      id: true,
      // O **tipo** entra desde a #165: é ele que escolhe o plugin que monta o documento. Sem esta
      // coluna, toda questão compilaria pelo caminho literal e o registry seguiria decorativo.
      type: true,
      statementLatex: true,
      solutionLatex: true,
      complementLatex: true,
      options: {
        // A ordem é a do `sortKey`, e é ela que decide a letra da alternativa (D9). Sem o
        // `orderBy`, o banco devolve na ordem que quiser e o gabarito passa a apontar para outra.
        orderBy: { sortKey: "asc" },
        // O `id` da alternativa vem junto porque o plugin o exige: o gabarito aponta para a
        // alternativa, nunca para a letra nem para a posição (D9).
        select: { id: true, statementLatex: true, isCorrect: true },
      },
      node: { select: { publication: { select: { workspaceId: true } } } },
    },
  });

  if (row === null || row.node === null) return null;

  return {
    workspaceId: row.node.publication.workspaceId,
    question: {
      id: row.id,
      // O tipo vai como está no banco. Tipo que o produto não conhece cai no fallback literal do
      // builder — escolher um por omissão seria decidir, em nome de quem importou, o que a
      // questão é.
      type: row.type,
      statementLatex: row.statementLatex,
      solutionLatex: row.solutionLatex,
      complementLatex: row.complementLatex,
      options: row.options,
    },
  };
}
