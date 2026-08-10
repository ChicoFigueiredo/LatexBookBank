/**
 * Fronteira: **reconhecimento matemático**.
 *
 * A regra que decide o desenho inteiro: o reconhecimento produz um **candidato**, nunca um valor
 * aplicado. Um OCR de matemática acerta a maior parte e erra o expoente — e o erro é invisível
 * para quem não reconferir contra o recorte. Por isso o resultado carrega `confidence` e
 * `alternatives`, e por isso o recorte original nunca é descartado (D29).
 *
 * A porta não sabe se quem responde é um modelo multimodal, um serviço dedicado ou um binário
 * local. Trocar de reconhecedor é trocar de implementação — nenhum caso de uso muda.
 *
 * Ver spec §19 · issue #125.
 */

export interface MathRecognitionRequest {
  /** Os bytes do recorte. PNG, normalmente — é o que o canvas do visualizador produz. */
  readonly image: Uint8Array;
  readonly mimeType: string;
  /**
   * O que se espera: uma fórmula solta ou um trecho com texto no meio.
   *
   * Muda o prompt e muda o que é resposta correta: `\frac{1}{2}` sozinho é `display`; "seja
   * $x=2$, calcule…" é `mixed`, e devolver só a fórmula ali perderia o enunciado.
   */
  readonly mode: "display" | "inline" | "mixed";
  readonly signal?: AbortSignal;
}

export interface MathRecognitionResult {
  readonly latex: string;
  /**
   * 0..1, ou `null` quando o provider não sabe dizer.
   *
   * `null` é diferente de zero, e a tela precisa distinguir: "não tenho confiança" pede revisão
   * atenta; "não sei medir confiança" pede a mesma revisão sem alarme.
   */
  readonly confidence: number | null;
  /** Outras leituras plausíveis, quando o provider oferece. A tela deixa escolher. */
  readonly alternatives: readonly string[];
  readonly providerId: string;
  readonly model: string;
  readonly durationMs: number;
}

export interface MathRecognitionProvider {
  readonly id: string;
  recognize(request: MathRecognitionRequest): Promise<MathRecognitionResult>;
}

export class MathRecognitionError extends Error {
  constructor(
    message: string,
    readonly providerId: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "MathRecognitionError";
  }
}

/**
 * O estado de um candidato na tela.
 *
 * `accepted` **não** é um estado que o reconhecedor produz: só o humano o alcança. É a diferença
 * entre "o modelo leu" e "eu conferi", e escondê-la faria o acervo herdar erros de OCR com cara
 * de dado revisado.
 */
export const RECOGNITION_STATES = ["candidate", "edited", "accepted", "rejected"] as const;
export type RecognitionState = (typeof RECOGNITION_STATES)[number];
