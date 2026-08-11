import { buildTree, type TreeNode } from "@modules/document-tree/domain/build-tree";
import type {
  DocumentTreeRepository,
  TreeNodeRecord,
} from "@modules/document-tree/domain/document-tree-repository";
import { optionLabelAt } from "@modules/questions/domain/question-type";
import type { NodeKind } from "@modules/document-tree/domain/node-kind";
import {
  hasProblem,
  statusFor,
  type NodeStatusId,
} from "@modules/document-tree/domain/node-status";

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
  /**
   * Tags aplicadas, só os nomes.
   *
   * Nome e não id: o DTO é o que a árvore desenha e filtra, e um id seria uma segunda consulta
   * para descobrir o que mostrar. A identidade importa na hora de aplicar ou remover — e aí a
   * tela pede a lista de tags do workspace, que já vem com id.
   */
  readonly tags: readonly string[];
}

export interface TreeNodeDto {
  readonly id: string;
  /**
   * O vocabulário fechado, não `string`.
   *
   * Era `string` porque a coluna é `String` no banco — mas a validação já acontece no adaptador
   * (`isNodeKind`), então o que chega aqui **é** um `NodeKind`. Declarar `string` obrigava a tela
   * a fazer o cast que a validação já tinha dispensado, e um cast é onde um tipo novo passa sem
   * ninguém notar.
   */
  readonly kind: NodeKind;
  readonly title: string;
  readonly originalLabel: string | null;
  readonly depth: number;
  readonly question: QuestionDto | null;
  /**
   * O estado a mostrar no nó, já decidido (§4.1).
   *
   * Decidido aqui e não na tela: a `Tree` tem **um** slot de status, e escolher qual dos estados
   * verdadeiros aparece é decisão de produto. `null` quando não há nada que valha um indicador —
   * uma árvore em que todo nó tem selo é uma árvore em que nenhum selo chama atenção.
   */
  readonly status: NodeStatusId | null;
  /** `true` quando o nó entra num filtro de "com problema", **independente** do selo escolhido. */
  readonly hasProblem: boolean;
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

/**
 * Como o nó se chama na árvore.
 *
 * A ordem é a do que identifica melhor: título dado, rótulo original do livro, **e então o começo
 * do enunciado**. O trecho do enunciado entrou porque uma questão recém-criada não tem nenhum dos
 * dois primeiros, e uma linha "Sem título" ao lado de outras cinco iguais não identifica nada —
 * era o resultado de criar cinco questões seguidas, que é justamente o uso normal.
 *
 * "Questão nova" só quando nem enunciado existe: é o estado que dura os segundos entre criar e
 * escrever, e ali "sem título" seria uma constatação inútil.
 */
function titleFor(node: TreeNodeRecord): string {
  if (node.title) return node.title;
  if (node.originalLabel) return `Questão ${node.originalLabel}`;

  const statement = node.question?.statementLatex.trim() ?? "";
  if (statement !== "") {
    // O LaTeX cru viraria "\\textbf{Calcule" na árvore. Isto não é renderização — é uma limpeza
    // do que atrapalha a leitura de uma linha de 30 caracteres.
    const plain = statement
      .replace(/\\[a-zA-Z]+\s*/g, " ")
      .replace(/[{}$\\]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (plain !== "") return plain.length > 60 ? `${plain.slice(0, 57)}…` : plain;
  }

  return node.question ? "Questão nova" : "Sem título";
}

const toDto = (entry: TreeNode<TreeNodeRecord>): TreeNodeDto => {
  const { node, depth } = entry;

  // Nó estrutural não tem estado a mostrar: um capítulo com selo de validação seria ruído.
  const facts = node.question
    ? {
        validationStatus: node.question.validationStatus,
        lastRenderState: node.question.renderJobs[0]?.state ?? null,
      }
    : {};

  return {
    id: node.id,
    kind: node.kind,
    title: titleFor(node),
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
          tags: node.question.tags.map((link) => link.tag.name),
          options: node.question.options.map((option, index) => ({
            id: option.id,
            label: optionLabelAt(index),
            statementLatex: option.statementLatex,
            isCorrect: option.isCorrect,
          })),
        }
      : null,
    status: node.question ? statusFor(facts) : null,
    hasProblem: node.question ? hasProblem(facts) : false,
  };
};
