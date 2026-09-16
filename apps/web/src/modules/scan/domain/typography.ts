import { median } from "./geometry";
import type { TextLine } from "./page";

/**
 * O estilo do próprio livro (§17 e §18 do prompt 03).
 *
 * Um título não é "22 pt negrito": é "o dobro do corpo deste livro, em negrito". As medidas são
 * relativas ao corpo, que é o tamanho da maioria dos caracteres — um livro em 10 pt e outro em
 * 12 pt têm o mesmo título em proporção, e é essa proporção que o perfil compara.
 */

export interface PublicationStyle {
  readonly bodySize: number;
  readonly bodyFont: string;
  /** A distância típica entre linhas consecutivas da mesma coluna. */
  readonly lineSpacing: number;
}

export function measureStyle(lines: readonly TextLine[]): PublicationStyle {
  const sizeVotes = new Map<number, number>();
  const fontVotes = new Map<string, number>();

  for (const line of lines) {
    const weight = line.text.length;
    const size = Math.round(line.size * 2) / 2;
    sizeVotes.set(size, (sizeVotes.get(size) ?? 0) + weight);
    if (line.mathRatio < 0.5) fontVotes.set(line.fontName, (fontVotes.get(line.fontName) ?? 0) + weight);
  }

  const bodySize = [...sizeVotes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 10;
  const bodyFont = [...fontVotes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";

  const gaps: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const previous = lines[i - 1];
    const line = lines[i];
    if (!previous || !line || previous.pageNumber !== line.pageNumber) continue;
    const gap = line.y0 - previous.y0;
    if (gap > bodySize * 0.8 && gap < bodySize * 2.2 && Math.abs(line.x0 - previous.x0) < bodySize * 3) {
      gaps.push(gap);
    }
  }

  return { bodySize, bodyFont, lineSpacing: modeOf(gaps) ?? bodySize * 1.2 };
}

/**
 * A entrelinha é a **moda** dos vãos, não a mediana: numa página de lista, o espaço entre itens
 * aparece tanto quanto o entre linhas, e a mediana cai no meio dos dois. Empate fica com o menor —
 * a entrelinha de verdade é o menor vão recorrente.
 */
function modeOf(values: readonly number[]): number | null {
  const counts = new Map<number, number>();
  for (const value of values) {
    const key = Math.round(value * 2) / 2;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  if (!best) return null;
  // A mediana dos vãos daquela classe, para não perder a fração que o arredondamento tirou.
  const members = values.filter((value) => Math.round(value * 2) / 2 === best[0]);
  return median(members);
}

/** A proporção entre o corpo da linha e o do livro. */
export const relativeSize = (line: TextLine, style: PublicationStyle): number =>
  style.bodySize > 0 ? line.size / style.bodySize : 1;

/**
 * A assinatura tipográfica de uma linha, arredondada o bastante para duas linhas do mesmo nível
 * coincidirem: é assim que o perfil "aprende" que os títulos de seção deste livro são 1,3× em
 * negrito e reconhece o próximo sem número.
 */
export function typographicSignature(line: TextLine, style: PublicationStyle): string {
  const ratio = Math.round(relativeSize(line, style) * 10) / 10;
  return `${ratio}|${line.bold ? "b" : ""}${line.italic ? "i" : ""}`;
}

/** Um título tem cara de título: maior que o corpo, ou do mesmo corpo em negrito e curto. */
export function looksLikeHeading(line: TextLine, style: PublicationStyle): boolean {
  const ratio = relativeSize(line, style);
  if (line.mathRatio > 0.3) return false;
  if (ratio >= 1.15) return true;
  return line.bold && line.text.length <= 80 && !/[.;,]$/.test(line.text);
}
