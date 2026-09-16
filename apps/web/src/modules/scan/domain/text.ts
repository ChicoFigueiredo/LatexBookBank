/**
 * Comparações de texto que não tropeçam em acento.
 *
 * Tudo começa em NFC (o PDF do LaTeX entrega NFD) e, quando a comparação é de **forma** e não de
 * conteúdo — marco de área, assinatura de mobília —, os acentos saem. "MATEMÁTICA" impresso com
 * e sem acento continua sendo o mesmo marco.
 */
export function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/\p{M}+/gu, "").normalize("NFC");
}

/** Maiúsculas, sem acento, espaços colapsados. */
export function foldText(text: string): string {
  return stripAccents(text).toUpperCase().replace(/\s+/g, " ").trim();
}

/** A forma de uma linha repetida: dígitos viram `#`, para "Página 3" e "Página 4" coincidirem. */
export function shapeOf(text: string): string {
  return foldText(text).replace(/\d+/g, "#");
}

const ROMAN = /^(?=[ivxlcdm]+$)m{0,3}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/i;

export function romanToNumber(text: string): number | null {
  if (!ROMAN.test(text)) return null;
  const values: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
  let total = 0;
  const lower = text.toLowerCase();
  for (let i = 0; i < lower.length; i++) {
    const current = values[lower[i] ?? ""] ?? 0;
    const next = values[lower[i + 1] ?? ""] ?? 0;
    total += current < next ? -current : current;
  }
  return total;
}

export function letterIndex(letter: string): number {
  return letter.toLowerCase().charCodeAt(0) - 97;
}
