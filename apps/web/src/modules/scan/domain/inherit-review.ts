import { boxRect } from "@/shared/geometry/normalized-box";

import { intersectionOverUnion, overlapRatio } from "./geometry";
import { SCAN_KIND_TRAITS, type ScanKind } from "./proposal";
import type { ScanItem } from "./scan-item";

/**
 * Herdar a revisão quando o livro é varrido de novo com outro perfil.
 *
 * Trocar de perfil era jogar fora a execução inteira: o `profileId` entra na `runKey`, então a
 * varredura nova nasce zerada e as horas de revisão da anterior vão junto. Quem está afinando
 * perfil faz isso muitas vezes, e era o gesto mais caro do módulo.
 *
 * O casamento é **geométrico**, e de propósito. A chave de um item (`EXERCISE:2.3`) é invenção do
 * perfil que o criou; o texto muda quando o outro perfil recorta o exemplo junto com a resolução;
 * o tipo muda por definição, já que trocar de perfil é trocar de vocabulário. O que não muda é
 * onde a coisa está impressa: a caixa é do papel, não da interpretação.
 */

/**
 * Sobreposição a partir da qual duas âncoras são "o mesmo lugar do livro".
 *
 * Mais frouxa que a `DUPLICATE_OVERLAP` da aprovação (0,8), e não por descuido: lá se compara o
 * mesmo perfil consigo mesmo, aqui dois perfis que recortam diferente — um pega o enunciado, o
 * outro pega o enunciado com a resolução junto. Frouxa demais casaria itens vizinhos; 0,6 exige
 * que a menor das duas caixas esteja bem dentro da outra.
 */
export const INHERIT_OVERLAP = 0.6;

/** O que uma pessoa decidiu, e que uma varredura nova não tem como redescobrir. */
export interface InheritedReview {
  readonly id: string;
  readonly reviewState: ScanItem["reviewState"];
  readonly reviewedText: string | null;
  readonly reviewedLatex: string | null;
  /** De qual item da execução anterior isto veio — a tela mostra, e o teste confere. */
  readonly fromId: string;
}

/** Decisão de gente, e não estado que a máquina produziu sozinha. */
const decidedByHand = (item: ScanItem): boolean =>
  item.reviewState === "APPROVED" ||
  item.reviewState === "REJECTED" ||
  item.reviewedText !== null ||
  item.reviewedLatex !== null;

/**
 * A menor razão entre as áreas das duas caixas para que sejam "o mesmo lugar" (#250, CAP-06).
 *
 * A sobreposição sobre a menor caixa sozinha casava o título de três linhas com o bloco inteiro
 * que o continha: o título herdava o aceite e o LaTeX revisado do bloco. Metade é o que ainda deixa
 * passar o caso que a contenção foi pensada para cobrir — o perfil novo que recorta o exemplo
 * junto com a resolução —, e barra o pedaço de um bloco maior.
 */
export const INHERIT_AREA_RATIO = 0.5;

const area = (box: ScanItem["regions"][number]["box"]) => box.width * box.height;

/**
 * Quanto dois itens são o mesmo lugar do livro: a maior interseção sobre união entre as âncoras
 * que passam nos dois limiares, ou 0 quando nenhuma passa.
 */
const spotScore = (a: ScanItem, b: ScanItem): number => {
  let best = 0;
  for (const one of a.regions) {
    for (const other of b.regions) {
      if (one.pageNumber !== other.pageNumber) continue;
      const [small, large] = [area(one.box), area(other.box)].sort((x, y) => x - y);
      if (!small || !large || small / large < INHERIT_AREA_RATIO) continue;
      if (overlapRatio(boxRect(one.box), boxRect(other.box)) < INHERIT_OVERLAP) continue;
      best = Math.max(best, intersectionOverUnion(boxRect(one.box), boxRect(other.box)));
    }
  }
  return best;
};

/**
 * Famílias de tipo entre as quais o texto revisado faz sentido (#250, CAP-06): o tipo muda ao
 * trocar de perfil, e o aceite atravessa assim mesmo; o texto, só dentro da família. A família de
 * cada tipo está na tabela de traços.
 */
const sameKindFamily = (a: ScanKind, b: ScanKind): boolean =>
  SCAN_KIND_TRAITS[a].family === SCAN_KIND_TRAITS[b].family;

/**
 * O que a execução nova herda da anterior.
 *
 * Só o que uma pessoa decidiu atravessa: aceitar, rejeitar e as correções de texto. `NEEDS_REVIEW`
 * e `AUTO_ACCEPTABLE` ficam para trás porque são leitura da máquina, e a máquina acabou de ler de
 * novo — com outro perfil, que pode discordar com razão.
 *
 * Um item anterior serve a um item novo, no máximo: sem isso, o exemplo que o perfil novo recorta
 * junto com a resolução herdaria o aceite de dois itens de uma vez. E vai ao novo que **mais**
 * coincide com ele, não ao primeiro da lista que casar (#250, CAP-06).
 *
 * O item que já está no acervo não empresta nada: o que ele decidiu já entrou, e a aprovação do
 * novo acharia o lugar "já no acervo" de qualquer jeito.
 */
export function inheritReview(
  previous: readonly ScanItem[],
  fresh: readonly ScanItem[],
): readonly InheritedReview[] {
  const decided = previous.filter((item) => decidedByHand(item) && item.documentNodeId === null);

  const pairs: { item: ScanItem; match: ScanItem; score: number; order: number }[] = [];
  for (const [order, item] of fresh.entries()) {
    for (const match of decided) {
      const score = spotScore(match, item);
      if (score > 0) pairs.push({ item, match, score, order });
    }
  }
  // O melhor casamento primeiro; no empate, a ordem da varredura nova.
  pairs.sort((a, b) => b.score - a.score || a.order - b.order);

  const usedOld = new Set<string>();
  const usedNew = new Set<string>();
  const inherited: { order: number; review: InheritedReview }[] = [];
  for (const { item, match, order } of pairs) {
    if (usedOld.has(match.id) || usedNew.has(item.id)) continue;
    const sameFamily = sameKindFamily(match.kind, item.kind);
    // Só a correção de texto, e de outra família: não há o que atravessar para este novo.
    const decidedState = match.reviewState === "APPROVED" || match.reviewState === "REJECTED";
    if (!decidedState && !sameFamily) continue;
    usedOld.add(match.id);
    usedNew.add(item.id);
    inherited.push({
      order,
      review: {
        id: item.id,
        reviewState: match.reviewState,
        reviewedText: sameFamily ? match.reviewedText : null,
        reviewedLatex: sameFamily ? match.reviewedLatex : null,
        fromId: match.id,
      },
    });
  }

  return inherited.sort((a, b) => a.order - b.order).map((entry) => entry.review);
}

/**
 * Os itens novos com a decisão herdada aplicada: o que a varredura grava de volta ao trocar de
 * perfil. Uma linha no laço (ARQ-14), e a regra inteira aqui, junto da que escolhe o que herdar.
 */
export function applyInheritedReview(
  previous: readonly ScanItem[],
  fresh: readonly ScanItem[],
): readonly ScanItem[] {
  const byId = new Map(fresh.map((item) => [item.id, item]));
  return inheritReview(previous, fresh).flatMap((decision) => {
    const item = byId.get(decision.id);
    return item
      ? [
          {
            ...item,
            reviewState: decision.reviewState,
            reviewedText: decision.reviewedText,
            reviewedLatex: decision.reviewedLatex,
          },
        ]
      : [];
  });
}
