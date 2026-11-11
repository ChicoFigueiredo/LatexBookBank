import { hasUnreadableSymbol } from "@modules/latex/domain/latex-escape";

import { bodyPieceLatex, contentLatex, headingTitle } from "./approval-latex";
import type { ProposedItem } from "./proposal";
import { snapshotOf, type MathResult, type ScanItem } from "./scan-item";

/**
 * O conserto, no lugar, dos itens de teoria que uma aprovação antiga já levou ao acervo (D76).
 *
 * Antes do `scan-engine@3`, o "1. Chama-se proposição…" do *Fundamentos* virava uma subseção sem
 * título e com o corpo começando na frase seguinte; e o título com nome perdia o símbolo que a
 * camada de texto não lê ("Conectivo ", sem o ∧). Refazer a importação mexeria nas 929 questões
 * do volume; aqui só o nó afetado muda, a partir de uma proposta nova do mesmo PDF.
 *
 * Duas etapas, porque no meio há o modelo de visão: `theoryRepairTargets` diz quem consertar e o
 * que reconhecer; `repairTheoryNode` diz como fica o nó, com o que o reconhecimento devolveu.
 */

export type TheoryRepairReason = "untitled" | "symbol";

export interface TheoryRepairTarget {
  readonly nodeId: string;
  readonly reason: TheoryRepairReason;
  /** O título na proposta nova. */
  readonly heading: ProposedItem;
  /** O texto que emenda no número, na proposta nova — só no item sem título. */
  readonly lead: ProposedItem | null;
  /** O título na proposta que foi aprovada. */
  readonly oldHeading: ScanItem;
  /** O texto que a aprovação antiga pôs no começo do corpo — é ele que sai. */
  readonly oldLead: ScanItem | null;
}

export interface RepairNode {
  readonly id: string;
  readonly title: string | null;
  readonly bodyLatex: string;
}

export type TheoryRepair =
  | {
      readonly nodeId: string;
      readonly title: string | null;
      readonly bodyLatex: string;
      /** O item antigo passa a descrever o trecho novo, para apagar a importação achá-lo (#249). */
      readonly leadUpdate: ScanItem | null;
    }
  | { readonly nodeId: string; readonly skipped: string };

const sameLabel = (a: ProposedItem, b: ProposedItem) => a.pageNumber === b.pageNumber && a.originalLabel === b.originalLabel;

/** Quem consertar: as subseções aprovadas que a proposta nova lê de outro jeito. */
export function theoryRepairTargets(
  oldItems: readonly ScanItem[],
  proposal: readonly ProposedItem[],
): TheoryRepairTarget[] {
  const targets: TheoryRepairTarget[] = [];
  for (const oldHeading of oldItems) {
    if (oldHeading.kind !== "SUBSECTION" || oldHeading.documentNodeId === null) continue;
    const heading = proposal.find((item) => item.kind === "SUBSECTION" && sameLabel(item, oldHeading));
    if (!heading) continue;

    const lead =
      proposal.find((item) => item.parentKey === heading.key && typeof item.metadata["leadLabel"] === "string") ?? null;
    const reason: TheoryRepairReason | null =
      heading.title === null && lead !== null
        ? "untitled"
        : heading.title !== null && hasUnreadableSymbol(heading.title)
          ? "symbol"
          : null;
    if (reason === null) continue;

    const oldLead =
      oldItems
        .filter((item) => item.parentKey === oldHeading.key && item.kind === "CONTENT" && item.documentNodeId === oldHeading.documentNodeId)
        .sort((a, b) => a.sortOrder - b.sortOrder)[0] ?? null;

    targets.push({ nodeId: oldHeading.documentNodeId, reason, heading, lead, oldHeading, oldLead });
  }
  return targets;
}

/** O item da proposta nova como item de execução, com o que o reconhecimento leu nele. */
function asScanItem(item: ProposedItem, mathResult: MathResult | null, id = ""): ScanItem {
  return {
    ...item,
    id,
    sortOrder: 0,
    reviewedText: null,
    reviewedLatex: null,
    proposed: snapshotOf(item),
    origin: "SCAN",
    aiDecision: null,
    mathResult,
    documentNodeId: null,
    approvedAt: null,
  };
}

/**
 * O nó já consertado não volta ao modelo.
 *
 * O reconhecimento não responde igual duas vezes, e reconhecer de novo mudaria um corpo que já
 * está certo: o que diz "já foi" é o item antigo descrevendo o trecho novo (`leadLabel`), e o
 * título sem buraco.
 */
export function alreadyRepaired(target: TheoryRepairTarget, node: RepairNode): boolean {
  if (target.reason === "symbol") return node.title !== null && !hasUnreadableSymbol(node.title);
  return node.title !== null && typeof target.oldLead?.metadata["leadLabel"] === "string";
}

/** Como fica o nó. Pula — e diz por quê — o que alguém mudou depois da aprovação. */
export function repairTheoryNode(
  target: TheoryRepairTarget,
  node: RepairNode,
  recognized: { readonly lead: MathResult | null; readonly heading: MathResult | null },
): TheoryRepair {
  if (target.reason === "symbol") {
    if (node.title !== target.oldHeading.title) {
      return { nodeId: node.id, skipped: "o título foi mudado depois da aprovação" };
    }
    const title = headingTitle(asScanItem(target.heading, recognized.heading), null);
    return { nodeId: node.id, title, bodyLatex: node.bodyLatex, leadUpdate: null };
  }

  if (target.lead === null || target.oldLead === null) {
    return { nodeId: node.id, skipped: "a aprovação não deixou texto no corpo deste nó" };
  }
  // O trecho antigo como o corpo o guarda. Uma aprovação anterior à troca dos símbolos gravava o
  // LaTeX reconhecido cru ("x ∈ A"), e o de hoje sai com o comando ("x $\in$ A"): os dois valem.
  const recognizedBefore = target.oldLead.reviewedLatex ?? target.oldLead.mathResult?.latex ?? null;
  const candidates = [bodyPieceLatex(target.oldLead), ...(recognizedBefore === null ? [] : [recognizedBefore.trim()])];
  const oldPiece = candidates.find((candidate) => candidate !== "" && node.bodyLatex.includes(candidate));
  if (oldPiece === undefined) {
    return { nodeId: node.id, skipped: "o corpo não tem o texto que o scan pôs — foi editado?" };
  }
  // Nem sempre no começo: a figura que o livro põe ao lado do item entra antes do texto.
  const at = node.bodyLatex.indexOf(oldPiece);

  const lead = asScanItem(target.lead, recognized.lead, target.oldLead.id);
  const piece = contentLatex(lead);
  const title = node.title ?? headingTitle(asScanItem(target.heading, null), piece);
  const leadUpdate: ScanItem = {
    ...target.oldLead,
    text: lead.text,
    regions: lead.regions,
    metadata: lead.metadata,
    needsMath: lead.needsMath,
    // O mesmo que fez o trecho: sem reconhecimento novo, o texto — e não o LaTeX antigo, mais curto.
    mathResult: recognized.lead,
  };
  const bodyLatex = node.bodyLatex.slice(0, at) + piece + node.bodyLatex.slice(at + oldPiece.length);
  return { nodeId: node.id, title, bodyLatex, leadUpdate };
}
