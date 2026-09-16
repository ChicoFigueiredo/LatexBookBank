/**
 * Comparações de texto que não tropeçam em acento.
 *
 * Tudo começa em NFC (o PDF do LaTeX entrega NFD) e, quando a comparação é de **forma** e não de
 * conteúdo — marco de área, assinatura de mobília —, os acentos saem. "MATEMÁTICA" impresso com
 * e sem acento continua sendo o mesmo marco.
 */
export function stripAccents(text: string): string {
  // O "ı" sem pingo é como o TeX antigo escreve o "í": sem o acento, ele precisa voltar a ser "i".
  return text.normalize("NFD").replace(/\p{M}+/gu, "").replace(/ı/g, "i").replace(/ȷ/g, "j").normalize("NFC");
}

/** Os acentos "soltos" do TeX antigo (OT1) e a marca combinante que cada um representa. */
const SPACING_ACCENTS: Readonly<Record<string, string>> = {
  "´": "́",
  "`": "̀",
  "ˆ": "̂",
  "˜": "̃",
  "¨": "̈",
  "¸": "̧",
  "˘": "̆",
  "ˇ": "̌",
  "˚": "̊",
  "˙": "̇",
};

export const isSpacingAccent = (text: string): boolean => text.length === 1 && text in SPACING_ACCENTS;

/** O trecho termina num acento solto — a letra que ele acentua vem no trecho seguinte. */
export const endsWithSpacingAccent = (text: string): boolean => {
  const last = text.trimEnd().slice(-1);
  return last !== "" && last in SPACING_ACCENTS;
};

/**
 * Recompõe o acento que o PDF escreveu como glifo separado: "Pref´ acio" → "Prefácio",
 * "edi¸c˜ ao" → "edição". O TeX em codificação OT1 desenha o acento antes da letra — inclusive a
 * cedilha —, e o texto extraído sai partido; sem isto, nenhuma palavra acentuada casa com nada.
 */
export function composeSpacingAccents(text: string): string {
  const withMarks = text
    // A cedilha só vai para "c": às vezes vem antes dele ("edi¸cao"), às vezes depois ("FUNC¸ ÕES").
    .replace(/¸\s*([cC])/g, (_, letter: string) => `${letter}̧`)
    .replace(/([cC])\s*¸\s*(?=\p{L})/gu, (_, letter: string) => `${letter}̧`)
    .replace(/([cC])\s*¸/g, (_, letter: string) => `${letter}̧`)
    .replace(/([´`ˆ˜¨˘ˇ˚˙])\s*(\p{L})/gu, (_, accent: string, letter: string) => {
      const base = letter === "ı" ? "i" : letter === "ȷ" ? "j" : letter;
      return base + (SPACING_ACCENTS[accent] ?? "");
    })
    .replace(/(\p{L})\s*([´`ˆ˜¨¸˘ˇ˚˙])/gu, (_, letter: string, accent: string) => letter + (SPACING_ACCENTS[accent] ?? ""));
  return withMarks.normalize("NFC");
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
