import {
  appendNodeAnchor,
  isAnchorRole,
  type AnchorRole,
  type NodeAnchorLink,
} from "@modules/assets/domain/node-anchors";
import { normalizeAnchor, type NormalizedBox } from "@modules/assets/domain/source-anchor";

/**
 * Acrescentar e retirar âncoras de uma questão pelo *Ver fonte* do editor (D43, D47).
 *
 * Acrescentar cria uma `SourceAnchor` nova — a âncora é imutável (D29) — sobre o mesmo PDF das
 * outras, ou sobre o PDF fonte do livro quando a questão ainda não tem nenhuma. Retirar desfaz só
 * a ligação: a âncora continua existindo, e outra questão pode apontar para ela.
 */

export interface AnchoredQuestion {
  readonly nodeId: string;
  readonly publicationId: string;
  readonly links: readonly NodeAnchorLink[];
  /** O PDF das âncoras que já existem, senão o PDF fonte do livro. */
  readonly sourceAssetId: string | null;
}

export interface NodeAnchorEditor {
  findByQuestion(questionId: string): Promise<AnchoredQuestion | null>;
  createAnchor(input: {
    readonly publicationId: string;
    readonly sourceAssetId: string;
    readonly pageNumber: number;
    readonly box: NormalizedBox;
  }): Promise<string>;
  replaceLinks(nodeId: string, links: readonly NodeAnchorLink[]): Promise<void>;
}

export class AnchorEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnchorEditError";
  }
}

export async function addQuestionAnchor(
  editor: NodeAnchorEditor,
  command: {
    readonly questionId: string;
    readonly pageNumber: number;
    readonly box: NormalizedBox;
    readonly role: unknown;
  },
): Promise<string> {
  const question = await editor.findByQuestion(command.questionId);
  if (!question) throw new AnchorEditError("Questão sem nó na árvore.");
  if (!question.sourceAssetId) {
    throw new AnchorEditError("O livro não tem PDF fonte: anexe um para marcar a origem.");
  }
  const role: AnchorRole = isAnchorRole(command.role) ? command.role : "CONTINUATION";
  const normalized = normalizeAnchor({ pageNumber: command.pageNumber, box: command.box, rotation: null });

  const anchorId = await editor.createAnchor({
    publicationId: question.publicationId,
    sourceAssetId: question.sourceAssetId,
    pageNumber: normalized.pageNumber,
    box: normalized.box,
  });
  await editor.replaceLinks(question.nodeId, appendNodeAnchor(question.links, anchorId, role));
  return anchorId;
}

export async function removeQuestionAnchor(
  editor: NodeAnchorEditor,
  command: { readonly questionId: string; readonly anchorId: string },
): Promise<void> {
  const question = await editor.findByQuestion(command.questionId);
  if (!question) throw new AnchorEditError("Questão sem nó na árvore.");
  const rest = question.links.filter((link) => link.sourceAnchorId !== command.anchorId);
  if (rest.length === question.links.length) throw new AnchorEditError("Esta âncora não é desta questão.");
  // Quem sobe para o primeiro lugar passa a responder pela origem.
  const promoted = rest.map((link, index) =>
    index === 0 && link.role === "CONTINUATION" ? { ...link, role: "PRIMARY" as const } : link,
  );
  await editor.replaceLinks(question.nodeId, promoted);
}
