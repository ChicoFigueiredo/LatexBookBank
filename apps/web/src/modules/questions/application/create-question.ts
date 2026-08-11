import type { DocumentTreeRepository } from "@modules/document-tree/domain/document-tree-repository";
import { resolvePlacement, type Placement } from "@modules/document-tree/domain/tree-mutations";
import { planQuestion, type QuestionBlueprint } from "@modules/questions/domain/question-blueprint";

/**
 * Criar uma questão — **uma operação, não três**.
 *
 * Este é o P0 crítico da §11 do prompt do time, e a razão é concreta: até aqui, uma questão só
 * nascia como `DocumentNode`, e o conteúdo vinha depois, por outra rota. Entre as duas chamadas a
 * árvore ficava com um nó do tipo `QUESTION` sem questão nenhuma — e se a segunda falhasse, ficava
 * assim para sempre. O acervo é o ativo principal (§54); um nó órfão nele é dado corrompido que
 * ninguém consegue nomear meses depois.
 *
 * Aqui: uma transação cria `Question`, `DocumentNode`, a posição e as alternativas iniciais. Em
 * falha, **nada** existe — nem nó órfão, nem questão órfã.
 */

export class DestinationNotFoundError extends Error {
  constructor(readonly nodeId: string) {
    super(`O destino ${nodeId} não existe nesta publicação.`);
    this.name = "DestinationNotFoundError";
  }
}

/** O que o writer recebe: tudo já decidido, nada a interpretar. */
export interface NewQuestionNode {
  readonly publicationId: string;
  readonly parentId: string | null;
  readonly sortKey: string;
  readonly title: string | null;
  readonly originalLabel: string | null;
  readonly blueprint: QuestionBlueprint;
  /** Recorte de origem, quando a questão nasce de uma captura revisada. */
  readonly sourceAnchorId?: string | null;
  readonly statementLatex?: string;
  readonly solutionLatex?: string;
  /** Texto e gabarito de cada alternativa, quando vêm de um candidato aprovado. */
  readonly options?: readonly { readonly statementLatex: string; readonly isCorrect: boolean }[];
}

export interface CreatedQuestion {
  readonly questionId: string;
  readonly nodeId: string;
  readonly publicationId: string;
}

/** Porta de escrita atômica. Um método, porque a operação é uma só. */
export interface QuestionCreator {
  createQuestionWithNode(input: NewQuestionNode): Promise<CreatedQuestion>;
}

export interface CreateQuestionCommand {
  readonly publicationId: string;
  readonly type: unknown;
  readonly placement: Placement;
  readonly title?: string | null;
  readonly originalLabel?: string | null;
  readonly difficulty?: unknown;
  readonly optionCount?: unknown;
  readonly sourceAnchorId?: string | null;
  readonly statementLatex?: string;
  readonly solutionLatex?: string;
  readonly options?: readonly { readonly statementLatex: string; readonly isCorrect: boolean }[];
}

export async function createQuestion(
  deps: { readonly reader: DocumentTreeRepository; readonly creator: QuestionCreator },
  command: CreateQuestionCommand,
): Promise<CreatedQuestion> {
  // O tipo é conferido **antes** da leitura da árvore: é o erro que o usuário consegue corrigir, e
  // uma consulta desperdiçada para recusar um tipo inválido é uma consulta desperdiçada.
  const blueprint = planQuestion({
    type: command.type,
    difficulty: command.difficulty,
    // Vindo conteúdo pronto, quem manda na quantidade é o conteúdo. Sem isto, um candidato do OCR
    // com seis alternativas nasceria com as cinco do padrão e a sexta sumiria em silêncio — que é
    // o pior jeito de perder trabalho de revisão já feito.
    optionCount: command.options ? command.options.length : command.optionCount,
  });

  const records = await deps.reader.listByPublication(command.publicationId);

  // O destino é conferido aqui, e não no adaptador: `resolvePlacement` lança `NodeNotFoundError`
  // para irmão inexistente, mas um `parentId` que não pertence a esta publicação passaria batido —
  // e a questão nasceria pendurada na árvore de outro livro.
  assertDestinationBelongs(records, command.placement);

  const { parentId, sortKey } = resolvePlacement(records, command.placement);

  return deps.creator.createQuestionWithNode({
    publicationId: command.publicationId,
    parentId,
    sortKey,
    title: command.title ?? null,
    originalLabel: command.originalLabel ?? null,
    blueprint,
    ...(command.sourceAnchorId !== undefined ? { sourceAnchorId: command.sourceAnchorId } : {}),
    ...(command.statementLatex !== undefined ? { statementLatex: command.statementLatex } : {}),
    ...(command.solutionLatex !== undefined ? { solutionLatex: command.solutionLatex } : {}),
    ...(command.options !== undefined ? { options: command.options } : {}),
  });
}

function assertDestinationBelongs(
  records: readonly { readonly id: string }[],
  placement: Placement,
): void {
  const target =
    placement.kind === "firstChild" || placement.kind === "lastChild"
      ? placement.parentId
      : placement.siblingId;

  if (target === null) return;
  if (!records.some((record) => record.id === target)) throw new DestinationNotFoundError(target);
}
