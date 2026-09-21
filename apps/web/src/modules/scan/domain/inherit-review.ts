import { boxRect, overlapRatio } from "./geometry";
import type { ScanItem } from "./scan-item";

/**
 * Herdar a revisão quando o livro é varrido de novo com outro perfil
 * ([ADR 0009](../../../../docs/adr/0009-trocar-de-perfil-herda-a-revisao.md)).
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

const sameSpot = (a: ScanItem, b: ScanItem): boolean =>
  a.regions.some((one) =>
    b.regions.some(
      (other) =>
        one.pageNumber === other.pageNumber &&
        overlapRatio(boxRect(one.box), boxRect(other.box)) >= INHERIT_OVERLAP,
    ),
  );

/**
 * O que a execução nova herda da anterior.
 *
 * Só o que uma pessoa decidiu atravessa: aceitar, rejeitar e as correções de texto. `NEEDS_REVIEW`
 * e `AUTO_ACCEPTABLE` ficam para trás porque são leitura da máquina, e a máquina acabou de ler de
 * novo — com outro perfil, que pode discordar com razão.
 *
 * Um item anterior serve a um item novo, no máximo: sem isso, o exemplo que o perfil novo recorta
 * junto com a resolução herdaria o aceite de dois itens de uma vez.
 */
export function inheritReview(
  previous: readonly ScanItem[],
  fresh: readonly ScanItem[],
): readonly InheritedReview[] {
  const decided = previous.filter(decidedByHand);
  const used = new Set<string>();
  const inherited: InheritedReview[] = [];

  for (const item of fresh) {
    const match = decided.find((candidate) => !used.has(candidate.id) && sameSpot(candidate, item));
    if (!match) continue;
    used.add(match.id);
    inherited.push({
      id: item.id,
      reviewState: match.reviewState,
      reviewedText: match.reviewedText,
      reviewedLatex: match.reviewedLatex,
      fromId: match.id,
    });
  }

  return inherited;
}
