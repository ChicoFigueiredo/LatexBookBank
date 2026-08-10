import type { MathRecognitionResult, RecognitionState } from "@/shared/ports";

/**
 * A revisão de um reconhecimento — **obrigatória, e sem atalho**.
 *
 * O que este arquivo protege: nenhum caminho leva de "o modelo leu" a "está no acervo" sem um
 * gesto humano no meio. Um OCR de matemática acerta a maior parte e erra o expoente, e o erro é
 * invisível para quem não reconferir contra o recorte — daí o recorte ficar ao lado do candidato
 * até o fim, e daí `accepted` não ser um estado que o reconhecedor alcança.
 *
 * Ver spec §19 · D29 · issue #125.
 */

export interface RecognitionCandidate {
  /** O `Asset(CROP)` de onde saiu. **Nunca descartado** (D29). */
  readonly cropAssetId: string;
  readonly result: MathRecognitionResult;
  /** O que o humano digitou por cima, quando digitou. */
  readonly editedLatex: string | null;
  readonly state: RecognitionState;
}

export function candidateFrom(
  cropAssetId: string,
  result: MathRecognitionResult,
): RecognitionCandidate {
  return { cropAssetId, result, editedLatex: null, state: "candidate" };
}

/** O LaTeX que vale agora: o editado, se houver; senão o lido. */
export const currentLatex = (candidate: RecognitionCandidate): string =>
  candidate.editedLatex ?? candidate.result.latex;

export class NotReviewedError extends Error {
  constructor() {
    super(
      "Este reconhecimento ainda não foi revisado. Confira o LaTeX contra o recorte antes de " +
        "aceitá-lo — o modelo acerta a maior parte e erra o expoente.",
    );
    this.name = "NotReviewedError";
  }
}

export class EmptyRecognitionError extends Error {
  constructor() {
    super("Não há LaTeX para aceitar — o reconhecimento voltou vazio.");
    this.name = "EmptyRecognitionError";
  }
}

/**
 * Editar move para `edited`, e **não** para `accepted`.
 *
 * São gestos diferentes: corrigir o texto e afirmar que ele está certo. Fundi-los faria uma
 * correção de meia frase, interrompida por um telefonema, virar um dado aprovado.
 */
export function edit(candidate: RecognitionCandidate, latex: string): RecognitionCandidate {
  return { ...candidate, editedLatex: latex, state: "edited" };
}

/**
 * Aceitar exige que alguém tenha olhado.
 *
 * O único caminho é passar por aqui, e ele recusa um candidato que ninguém tocou **ou** conferiu.
 * `reviewed` é o clique de "conferi" da tela — o gesto que a spec chama de revisão humana
 * obrigatória.
 */
export function accept(candidate: RecognitionCandidate, reviewed: boolean): RecognitionCandidate {
  if (!reviewed && candidate.state !== "edited") throw new NotReviewedError();
  if (currentLatex(candidate).trim() === "") throw new EmptyRecognitionError();

  return { ...candidate, state: "accepted" };
}

/**
 * Rejeitar não apaga nada.
 *
 * O recorte fica: ele é fonte (D29), e a próxima tentativa de reconhecimento parte dele. Apagar
 * o crop ao rejeitar a leitura confundiria "esta transcrição está errada" com "este pedaço da
 * página não interessa".
 */
export const reject = (candidate: RecognitionCandidate): RecognitionCandidate => ({
  ...candidate,
  state: "rejected",
});

/**
 * O que a tela mostra sobre a confiança.
 *
 * `null` e zero são coisas diferentes, e a diferença muda o que a pessoa faz: "não tenho
 * confiança" pede revisão atenta; "não sei medir confiança" pede a mesma revisão, sem alarme.
 * Um `0%` inventado para o caso `null` transformaria ausência de medida em alerta falso.
 */
export function describeConfidence(confidence: number | null): string {
  if (confidence === null) return "sem medida de confiança — confira contra o recorte";
  if (confidence >= 0.9) return `confiança alta (${percent(confidence)})`;
  if (confidence >= 0.6) return `confiança média (${percent(confidence)}) — vale conferir`;
  return `confiança baixa (${percent(confidence)}) — confira com atenção`;
}

const percent = (value: number): string => `${Math.round(value * 100)}%`;
