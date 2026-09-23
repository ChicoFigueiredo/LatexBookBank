import type { NormalizedBox } from "@modules/assets/domain/source-anchor";
import type { AnchorRole } from "@modules/assets/domain/node-anchors";
import type { NodeKind } from "@modules/document-tree/domain/node-kind";
import { isQuestionType, type QuestionType } from "@modules/questions/domain/question-type";

import { contentLatex, exampleBody, exampleTitle, figureLatex, questionLatex } from "./approval-latex";
import { boxRect, overlapRatio } from "./geometry";
import type { ProposedRegion, ScanKind } from "./proposal";
import type { ScanItem } from "./scan-item";
import { foldText } from "./text";

/**
 * O plano da aprovação (Fase 8 do prompt 03 · D53 · ADR 0002): o que cada item aceito vira no
 * acervo, calculado sem tocar em nada. A infraestrutura executa o plano numa transação só.
 *
 * Três regras que o plano garante:
 * - **o filho só entra com o pai** aprovado ou já no acervo — um exercício não nasce solto porque o
 *   capítulo dele ainda está em revisão;
 * - **nada entra duas vezes** — o capítulo que já existe no destino é reaproveitado, e o item cujas
 *   âncoras coincidem com as de um nó que já existe fica marcado *já no acervo*;
 * - **item rejeitado some do caminho**, e os filhos dele sobem para o avô.
 */

export interface ExistingNode {
  readonly id: string;
  readonly parentId: string | null;
  readonly kind: NodeKind;
  readonly title: string | null;
  readonly originalLabel: string | null;
}

export interface ExistingAnchor {
  readonly nodeId: string;
  readonly pageNumber: number;
  readonly box: NormalizedBox;
}

export type NodeRef =
  | { readonly type: "existing"; readonly id: string }
  | { readonly type: "planned"; readonly ref: string }
  | { readonly type: "root" };

export interface PlannedQuestion {
  readonly type: QuestionType;
  readonly statementLatex: string;
  /** A resolução impressa no livro, quando o exercício vem com ela; vazio quando não vem. */
  readonly solutionLatex: string;
  readonly originalLatex: string;
  readonly options: readonly string[];
}

export type ApprovalStep =
  | {
      readonly type: "createNode";
      readonly ref: string;
      readonly itemIds: readonly string[];
      readonly parent: NodeRef;
      readonly kind: NodeKind;
      readonly title: string | null;
      readonly originalLabel: string | null;
      readonly anchors: readonly ProposedRegion[];
      readonly sourceText: string;
      readonly question: PlannedQuestion | null;
      /** O corpo do nó, quando ele nasce com texto: hoje só o exemplo (D56). */
      readonly body: string | null;
    }
  | { readonly type: "reuseNode"; readonly itemIds: readonly string[]; readonly nodeId: string }
  | {
      readonly type: "appendBody";
      readonly itemIds: readonly string[];
      readonly target: NodeRef;
      readonly latex: string;
      readonly anchors: readonly ProposedRegion[];
      readonly sourceText: string;
      /** O recorte já gravado, quando é figura (D58): a âncora passa a apontar para o arquivo. */
      readonly cropAssetId: string | null;
    }
  | { readonly type: "alreadyInCollection"; readonly itemIds: readonly string[]; readonly nodeId: string };

export interface ApprovalPlan {
  readonly steps: readonly ApprovalStep[];
  readonly skipped: readonly { readonly itemId: string; readonly reason: string }[];
}

/**
 * O que a aprovação precisa do perfil — e só isto (ADR 0008).
 *
 * Levar o `CaptureProfile` inteiro aqui escondia um fato útil: o plano não chama gancho nenhum,
 * não classifica linha, não decide quem contém quem. Ele lê três dados. Dizer isso no tipo é o
 * que permite aprovar uma proposta pronta com o **retrato** do perfil, depois que o perfil vivo
 * saiu do registro.
 */
export interface ApprovalProfile {
  readonly id: string;
  readonly version: number;
  readonly defaultQuestionType: QuestionType;
}

export interface ApprovalInput {
  readonly items: readonly ScanItem[];
  readonly profile: ApprovalProfile;
  readonly destinationId: string | null;
  /** Aprovação em lote: os `AUTO_ACCEPTABLE` entram junto com os aceitos (§37). */
  readonly includeSuggested: boolean;
  readonly existingNodes: readonly ExistingNode[];
  readonly existingAnchors: readonly ExistingAnchor[];
}

/** Quantas alternativas uma questão precisa ter para ser de múltipla escolha — ver a aprovação. */
export const MIN_ALTERNATIVES = 4;

/** Sobreposição, na mesma página, a partir da qual a âncora "já está no acervo" (D53). */
export const DUPLICATE_OVERLAP = 0.8;

const NODE_KIND: Partial<Record<ScanKind, NodeKind>> = {
  PART: "PART",
  CHAPTER: "CHAPTER",
  SECTION: "SECTION",
  SUBSECTION: "SUBSECTION",
  EXERCISE_GROUP: "QUESTION_GROUP",
  // D56: o exemplo tem endereço próprio, e por isso é nó — e não mais texto no corpo da seção.
  EXAMPLE: "EXAMPLE",
};

const BODY_KINDS: ReadonlySet<ScanKind> = new Set(["CONTENT", "NOTE", "FIGURE"]);
const QUESTION_KINDS: ReadonlySet<ScanKind> = new Set(["EXERCISE", "QUESTION"]);
const FOLDED_KINDS: ReadonlySet<ScanKind> = new Set(["ITEM", "SUBITEM"]);

const sameText = (a: string | null, b: string | null) =>
  a !== null && b !== null && foldText(a) === foldText(b);

export function planApproval(input: ApprovalInput): ApprovalPlan {
  const { items, profile } = input;
  const byKey = new Map(items.map((item) => [item.key, item]));
  const resolved = new Map<string, NodeRef>();
  const steps: ApprovalStep[] = [];
  const skipped: { itemId: string; reason: string }[] = [];
  const destination: NodeRef = input.destinationId
    ? { type: "existing", id: input.destinationId }
    : { type: "root" };

  const eligible = (item: ScanItem) =>
    !item.documentNodeId &&
    (item.reviewState === "APPROVED" || (input.includeSuggested && item.reviewState === "AUTO_ACCEPTABLE"));

  for (const item of items) {
    if (item.documentNodeId) resolved.set(item.key, { type: "existing", id: item.documentNodeId });
  }

  const parentItem = (item: ScanItem) => (item.parentKey ? (byKey.get(item.parentKey) ?? null) : null);

  const containerFor = (item: ScanItem): NodeRef | null => {
    let parent = parentItem(item);
    while (parent) {
      if (parent.reviewState === "REJECTED") {
        parent = parentItem(parent);
        continue;
      }
      return resolved.get(parent.key) ?? null;
    }
    return destination;
  };

  const duplicateOf = (item: ScanItem): string | null => {
    const match = input.existingAnchors.find((anchor) =>
      item.regions.some(
        (region) =>
          region.pageNumber === anchor.pageNumber &&
          overlapRatio(boxRect(region.box), boxRect(anchor.box)) >= DUPLICATE_OVERLAP,
      ),
    );
    return match?.nodeId ?? null;
  };

  const descendants = (item: ScanItem): ScanItem[] => {
    const direct = items.filter((candidate) => candidate.parentKey === item.key);
    return direct.flatMap((child) => [child, ...descendants(child)]);
  };

  for (const item of [...items].sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (!eligible(item) || FOLDED_KINDS.has(item.kind)) continue;

    const container = containerFor(item);
    if (container === null) {
      skipped.push({ itemId: item.id, reason: "o item acima dele ainda não foi aprovado" });
      continue;
    }

    const nodeKind = NODE_KIND[item.kind];

    if (nodeKind) {
      const parentId = container.type === "existing" ? container.id : container.type === "root" ? null : undefined;
      const reuse =
        parentId === undefined
          ? undefined
          : input.existingNodes.find(
              (node) =>
                node.parentId === parentId &&
                node.kind === nodeKind &&
                ((item.number !== null && (node.originalLabel === item.number || node.originalLabel === item.originalLabel)) ||
                  sameText(node.title, item.title)),
            );
      if (reuse) {
        steps.push({ type: "reuseNode", itemIds: [item.id], nodeId: reuse.id });
        resolved.set(item.key, { type: "existing", id: reuse.id });
      } else {
        steps.push({
          type: "createNode",
          ref: item.id,
          itemIds: [item.id],
          parent: container,
          kind: nodeKind,
          // O exemplo não traz título do livro: o dele é o começo do próprio texto (D56).
          title: item.kind === "EXAMPLE" ? exampleTitle(item) : item.title,
          // "Exercícios" como rótulo e como título diria a mesma coisa duas vezes na árvore.
          originalLabel: item.number ?? (sameText(item.originalLabel, item.title) ? null : item.originalLabel),
          anchors: item.regions,
          sourceText: item.text,
          question: null,
          body: item.kind === "EXAMPLE" ? exampleBody(item) : null,
        });
        resolved.set(item.key, { type: "planned", ref: item.id });
      }
      continue;
    }

    const duplicate = duplicateOf(item);
    if (duplicate) {
      steps.push({ type: "alreadyInCollection", itemIds: [item.id], nodeId: duplicate });
      resolved.set(item.key, { type: "existing", id: duplicate });
      continue;
    }

    if (QUESTION_KINDS.has(item.kind)) {
      const children = descendants(item).filter((child) => FOLDED_KINDS.has(child.kind));
      /*
        O tipo vem do item quando a zona o carimbou (ADR 0009).

        Um perfil tem um tipo padrão, e isso basta enquanto o livro inteiro faz o mesmo tipo de
        pergunta. O *Fundamentos* não faz: 568 exercícios discursivos no corpo e ~351 questões de
        vestibular com alternativas, no mesmo volume. O padrão do perfil vira o que sempre deveria
        ter sido — o que vale quando ninguém disse nada.
      */
      const stamped = item.metadata["questionType"];
      const fromZone = typeof stamped === "string" && isQuestionType(stamped);
      const wanted = fromZone ? stamped : profile.defaultQuestionType;
      const withOptions = wanted === "MULTIPLE_CHOICE" || wanted === "MULTIPLE_CORRECT";
      /*
        Múltipla escolha tem quatro ou cinco alternativas — e o que tem menos é outra coisa.

        A zona diz o tipo do **trecho**, não de cada questão, e a seção de vestibulares mistura
        feitios. Medido no Fundamentos, contando as alternativas que a aprovação achava:

          2 ou 3  →  todas eram discursivas com subitens: "a) Esboce o gráfico… b) Determine…"
          4 ou 5  →  todas eram múltipla escolha: "50 | 51 | 60 | 61", "13,83 °C | 13,86 °C…"
          0 ou 1  →  de soma, com "(16)", "(32)", "(64)"; ou aberta, "Justifique sua escolha"

        Na página, subitem e alternativa são a mesma coisa: letra e parêntese. Quem as separa é a
        quantidade, que é a regra do próprio vestibular brasileiro.

        E o rebaixamento refaz o LaTeX sem alternativas: senão os subitens, já consumidos como
        opções, sumiriam do enunciado de uma questão que não tem onde guardá-las.

        **Só o tipo que veio da zona é rebaixado.** A zona é palpite sobre um trecho; o padrão do
        perfil é afirmação sobre o documento inteiro. O caderno do ENEM é todo de múltipla escolha,
        e a questão dele com as alternativas em imagem não tem texto para contar — rebaixá-la
        apagaria o que o perfil sabe com certeza.
      */
      const tentativa = questionLatex(item, children, withOptions);
      const rebaixa = fromZone && withOptions && tentativa.options.length < MIN_ALTERNATIVES;
      const type: QuestionType = rebaixa ? "DISCURSIVE" : wanted;
      const latex = rebaixa ? questionLatex(item, children, false) : tentativa;
      steps.push({
        type: "createNode",
        ref: item.id,
        itemIds: [item.id, ...children.filter((child) => child.reviewState !== "REJECTED").map((child) => child.id)],
        parent: container,
        kind: "QUESTION",
        title: null,
        originalLabel: item.number ?? item.originalLabel,
        anchors: item.regions,
        sourceText: item.text,
        question: { type, ...latex },
        body: null,
      });
      resolved.set(item.key, { type: "planned", ref: item.id });
      continue;
    }

    if (BODY_KINDS.has(item.kind)) {
      if (container.type === "root") {
        skipped.push({ itemId: item.id, reason: "texto fora de qualquer seção: escolha um destino" });
        continue;
      }
      steps.push({
        type: "appendBody",
        itemIds: [item.id],
        target: container,
        latex: item.kind === "FIGURE" ? figureLatex(item) : contentLatex(item),
        cropAssetId: item.kind === "FIGURE" ? (typeof item.metadata["figureAsset"] === "string" ? item.metadata["figureAsset"] : null) : null,
        anchors: item.regions.map((region) => ({
          ...region,
          role: (item.kind === "FIGURE" ? "ILLUSTRATION" : "CONTINUATION") as AnchorRole,
        })),
        sourceText: item.text,
      });
      resolved.set(item.key, container);
      continue;
    }

    skipped.push({ itemId: item.id, reason: `o tipo ${item.kind} não tem lugar no acervo` });
  }

  return { steps, skipped };
}

