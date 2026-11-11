import { latexToPlain } from "./approval-latex";
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

export function recognitionDrift(text: string, latex: string): RecognitionDrift | null {
  const layer = tokensOf(text.replace(UNREADABLE, " "));
  if (layer.length === 0) return null;
  const plain = latexToPlain(latex.replace(/\}\s*\{/g, "} {").replace(/[\^_]\{?/g, " "));
  const model = tokensOf(plain);
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
