import { buildTree, type TreeNode } from "@modules/document-tree/domain/build-tree";
import type {
  DocumentTreeRepository,
  TreeNodeRecord,
} from "@modules/document-tree/domain/document-tree-repository";
import { optionLabelAt } from "@modules/questions/domain/question-type";

/**
 * Use case: montar a árvore de uma publicação para exibição.
 *
 * Devolve **DTOs**, nunca entidades do Prisma (auditoria §40). A diferença não é cerimônia:
 * a linha do Prisma carrega `createdAt`, `legacyId`, `publicationId` e o formato de coluna do
 * motor em uso. Entregar isso ao React vazaria o schema para a camada de apresentação e faria
 * a troca de motor da Fase 6.5 aparecer na UI.
 */

export interface OptionDto {
  readonly id: string;
  /** Letra **calculada da ordem**, nunca lida do banco (spec §8.5). */
  readonly label: string;
  readonly statementLatex: string;
  readonly isCorrect: boolean;
}

export interface QuestionDto {
  readonly id: string;
  readonly type: string;
  /**
   * Token de concorrência otimista, não um timestamp de auditoria.
   *
   * O DTO não expõe `createdAt`/`updatedAt` de propósito (auditoria §40) — são colunas, e vazá-las
   * amarraria a apresentação ao schema. Este campo é diferente: o cliente **precisa** devolvê-lo
   * ao salvar, ou não há como recusar uma sobrescrita (spec §42). O nome diz para que serve.
   */
  readonly version: string;
  readonly statementLatex: string;
  readonly solutionLatex: string;
  readonly complementLatex: string;
  readonly difficultyLabel: string;
  readonly source: string | null;
  readonly options: readonly OptionDto[];
}

export interface TreeNodeDto {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly originalLabel: string | null;
  readonly depth: number;
  readonly question: QuestionDto | null;
}

const DIFFICULTY_LABELS: Readonly<Record<number, string>> = {
  0: "Muito Fácil",
  2: "Fácil",
  5: "Médio",
  7: "Difícil",
  10: "Muito Difícil",
};

export async function getPublicationTree(
  repository: DocumentTreeRepository,
  publicationId: string,
): Promise<readonly TreeNodeDto[]> {
  const records = await repository.listByPublication(publicationId);
  return flatten(buildTree(records));
}

/** Achata de novo para exibição, agora com `depth` — a UI indenta sem recursão própria. */
function flatten(nodes: readonly TreeNode<TreeNodeRecord>[]): readonly TreeNodeDto[] {
  const out: TreeNodeDto[] = [];

  const visit = (entries: readonly TreeNode<TreeNodeRecord>[]): void => {
    for (const entry of entries) {
      out.push(toDto(entry));
      visit(entry.children);
    }
  };

  visit(nodes);
  return out;
}

const toDto = (entry: TreeNode<TreeNodeRecord>): TreeNodeDto => {
  const { node, depth } = entry;

  return {
    id: node.id,
    kind: node.kind,
    // Questão sem título usa o rótulo original do livro; sem ele, um marcador neutro.
    title: node.title ?? (node.originalLabel ? `Questão ${node.originalLabel}` : "Sem título"),
    originalLabel: node.originalLabel,
    depth,
    question: node.question
      ? {
          id: node.question.id,
          type: node.question.type,
          version: node.question.updatedAt.toISOString(),
          statementLatex: node.question.statementLatex,
          solutionLatex: node.question.solutionLatex,
          complementLatex: node.question.complementLatex,
          difficultyLabel: DIFFICULTY_LABELS[node.question.difficulty] ?? "—",
          source: [node.question.board, node.question.year].filter(Boolean).join(" · ") || null,
          options: node.question.options.map((option, index) => ({
            id: option.id,
            label: optionLabelAt(index),
            statementLatex: option.statementLatex,
            isCorrect: option.isCorrect,
          })),
        }
      : null,
  };
};
