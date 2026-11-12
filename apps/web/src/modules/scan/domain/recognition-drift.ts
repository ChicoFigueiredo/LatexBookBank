import { escapeLatexText } from "@modules/latex/domain/latex-escape";

import { joinLines, latexToPlain } from "./approval-latex";
import type { Diagnostic } from "./proposal";

/**
 * Onde o reconhecimento diverge do PDF no que não pode divergir: números e V/F (D78).
 *
 * O modelo de visão escreve bem a frase e erra o detalhe: no *Fundamentos* vol. 1, "3/2 = 6/4"
 * virou "3/2 = 6" (p. 16), e "p ∨ q: 3 ≤ 3" virou "3 = 3 ou 3 < 3" (p. 13) — a 200, 300 e 400
 * dpi. A camada de texto não lê o símbolo, mas lê cada dígito; o que um tem e o outro não, é
 * o que alguém precisa conferir antes de aprovar.
 *
 * Dígito a dígito, e não número a número: a camada de texto cola o expoente no número ("22"
 * para 2²) e o modelo o separa (`2^{2}`). A ordem não entra: a fração empilhada sai em ordens
 * diferentes nos dois.
 */

const TOKENS = /\d|(?<!\p{L})[VF](?!\p{L})/gu;
const UNREADABLE = /[-\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

const tokensOf = (text: string): string[] => [...(text.match(TOKENS) ?? [])].sort();

/** O que sobra de `a` depois de tirar, um a um, o que também está em `b`. */
function minus(a: readonly string[], b: readonly string[]): string[] {
  const rest = [...b];
  return a.filter((token) => {
    const at = rest.indexOf(token);
    if (at < 0) return true;
    rest.splice(at, 1);
    return false;
  });
}

export interface RecognitionDrift {
  /** No PDF e não no reconhecimento. */
  readonly missing: readonly string[];
  /** No reconhecimento e não no PDF. */
  readonly extra: readonly string[];
}

const modelTokens = (latex: string): string[] =>
  tokensOf(latexToPlain(latex.replace(/\}\s*\{/g, "} {").replace(/[\^_]\{?/g, " ")));

/**
 * Os números e V/F que o reconhecimento trouxe e o PDF não tem — mesmo quando o PDF não tem
 * número nenhum, que é onde a invenção mais aparece.
 */
export function inventedTokens(text: string, latex: string): string[] {
  return minus(modelTokens(latex), tokensOf(text.replace(UNREADABLE, " ")));
}

export function recognitionDrift(text: string, latex: string): RecognitionDrift | null {
  const layer = tokensOf(text.replace(UNREADABLE, " "));
  const model = modelTokens(latex);
  if (layer.length === 0 && model.length === 0) return null;
  const missing = minus(layer, model);
  const extra = minus(model, layer);
  return missing.length === 0 && extra.length === 0 ? null : { missing, extra };
}

/** O diagnóstico que o item ganha quando o reconhecimento diverge do PDF. */
export function driftDiagnostic(drift: RecognitionDrift): Diagnostic {
  const list = (tokens: readonly string[]) => (tokens.length === 0 ? "—" : tokens.slice(0, 12).join(" "));
  return {
    status: "suspicious",
    reasons: [`o reconhecimento difere do PDF nos números: falta ${list(drift.missing)}; sobra ${list(drift.extra)}`],
    facts: { missing: [...drift.missing], extra: [...drift.extra] },
  };
}

/**
 * O nome do operador não é palavra (vol. 8, exercício 96). A camada lê o "lim" — e o "xlim", com a
 * variável de baixo colada nele —, e o `\lim` do modelo não vira texto: num exercício de limites,
 * quatro das cinco palavras da camada "faltavam" no modelo, e a leitura certa ia embora pela
 * camada embaralhada. Fora dos dois lados, como o nome do ambiente.
 */
const OPERATOR =
  /^[a-z]?(?:lim|sen|sin|cos|tg|tan|cotg|cot|sec|cossec|cosec|csc|log|ln|exp|arcsen|arcsin|arccos|arctg|arctan|senh|cosh|tgh|mdc|mmc|max|min|det)$/;

/** As palavras de três letras ou mais, sem acento e em minúsculas — a hifenização do PDF desfeita. */
const wordsOf = (text: string): string[] =>
  (
    text
      .replace(/-\s*\n\s*/g, "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .match(/[a-z]{3,}/g) ?? []
  ).filter((word) => !OPERATOR.test(word));

/**
 * O pedaço reconhecido concorda com o que a camada de texto tem dentro dele (D78)?
 *
 * O modelo inventa de dois jeitos: com número — a tabela-verdade que o livro não tem — e com
 * frase — a LEITURA da p. 46 saiu como uma página sobre "Aplicações da Integral Definida". A
 * camada de texto lê cada palavra; o que ela não lê é o símbolo. Discordar é perder boa parte das
 * palavras do PDF, trazer muitas que ele não tem, ou trazer número que ele não tem.
 */
export function chunkAgrees(text: string, latex: string): boolean {
  return inventedTokens(text, latex).length <= 2 && wordsAgree(text, latex);
}

/**
 * Palavras que o modelo pode trazer a mais onde a camada de texto quase não tem palavra — os
 * rótulos de um diagrama. Mais que isso é frase que a página não tem: entre os diagramas do
 * exercício 142 (p. 91), a camada lia "a) c) A B A B" e o modelo escreveu a área do trapézio.
 */
const FEW_WORDS_EXTRA = 6;

function wordsAgree(text: string, latex: string): boolean {
  const layer = wordsOf(text);
  const model = wordsOf(latexToPlain(latex));
  if (layer.length < 5) return minus(model, layer).length <= FEW_WORDS_EXTRA;
  const recall = minus(layer, model).length / layer.length;
  const extra = model.length === 0 ? 1 : minus(model, layer).length / model.length;
  return recall <= 0.4 && extra <= 0.5;
}

/**
 * O modelo que resolve o exercício em vez de transcrevê-lo (vol. 1, exercícios 181, 183 e 184).
 *
 * "Obtenha a equação da reta que passa pelo ponto (−2, 4)…" saía com a resolução embaixo — linhas
 * de conta que o livro não tem, e no 183 errada. A conferência deixava passar: a camada tem buraco
 * no lugar do "−", e aí o modelo fica (`keepsModel`). A cauda inventada se reconhece: vem depois
 * de o modelo já ter dito as palavras da camada, não tem palavra nenhuma, traz número que a camada
 * não tem — e são mais linhas do que a camada tem linhas sem palavra, que é onde a conta impressa
 * do livro estaria.
 */
export function withoutInventedTail(text: string, latex: string): string {
  // A figura que é tabela chega sem texto: as células vêm da camada, linha a linha.
  if (!text) return latex;
  const layer = new Set(wordsOf(text));
  if (layer.size === 0 || inventedTokens(text, latex).length <= 2) return latex;
  const lines = latex.split("\n");
  const seen = new Set<string>();
  let cut = -1;
  for (const [index, line] of lines.entries()) {
    for (const word of wordsOf(latexToPlain(line))) seen.add(word);
    if ([...layer].filter((word) => seen.has(word)).length >= layer.size * 0.9) {
      cut = index + 1;
      break;
    }
  }
  if (cut < 0 || cut >= lines.length) return latex;
  const tail = lines.slice(cut).filter((line) => line.trim() !== "");
  const bareLayerLines = text.split("\n").filter((line) => line.trim() !== "" && wordsOf(line).length === 0).length;
  const head = lines.slice(0, cut).join("\n").trimEnd();
  // O começo tem de manter os números do livro: no exercício 418 do vol. 3, o modelo inventou quatro
  // equações e depois transcreveu as quatro de verdade — cortar ali levaria as duas.
  const layerTokens = tokensOf(text.replace(UNREADABLE, " "));
  const lost = minus(layerTokens, modelTokens(head)).length;
  const invented =
    tail.length > bareLayerLines &&
    tail.every((line) => wordsOf(latexToPlain(line)).length === 0) &&
    inventedTokens(text, head).length <= 2 &&
    lost <= Math.max(2, layerTokens.length * 0.2);
  return invented ? head : latex;
}

/**
 * O pedaço que não concorda nem refeito: fica a leitura do modelo, ou o texto da camada?
 *
 * A camada, em regra — perde o símbolo, mas não inventa. Menos quando ela mesma tem buraco no
 * lugar do símbolo e as palavras batem: aí a divergência é de número, e é a camada que lê mal. O
 * sistema de duas equações do exercício 174 (p. 112) sai dela como "5xx  yy  15", com os dígitos
 * das duas linhas embaralhados; o modelo lia o sistema. O item fica *suspeito* pelo diagnóstico de
 * números, e quem revisa decide.
 */
export function keepsModel(text: string, latex: string): boolean {
  return chunkAgrees(text, latex) || (UNREADABLE_IN_LAYER.test(text) && wordsAgree(text, latex));
}

const UNREADABLE_IN_LAYER = /[-\u0000-\u0008\u000B\u000C\u000E-\u001F]/;

/**
 * O texto da camada do PDF, em LaTeX, para o pedaço em que o modelo não é confiável: sem o
 * símbolo que ela não lê — que sai como a caixa de símbolo ilegível —, mas sem inventar nada.
 */
export function layerLatex(text: string): string {
  return escapeLatexText(joinLines(text.split("\n")));
}
