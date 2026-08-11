/**
 * Vocabulário de questões. Coluna `String` no banco — o conector SQLite não suporta `enum`.
 */

export const QUESTION_TYPES = [
  "DISCURSIVE",
  "MULTIPLE_CHOICE",
  "TRUE_FALSE",
  "CESPE",
  "MULTIPLE_CORRECT",
  "SUM_OF_CORRECT",
  "RELATED_ITEMS",
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

export const isQuestionType = (value: string): value is QuestionType =>
  (QUESTION_TYPES as readonly string[]).includes(value);

/**
 * Do `TipoQuestao` legado positivo para o tipo novo.
 *
 * Os tipos 3–7 existem no vocabulário legado mas têm **zero linhas** no acervo. Estão mapeados
 * porque o custo é uma linha cada, e porque um import que encontrasse um deles precisa falhar
 * ruidosamente em vez de descartar a questão.
 */
export const LEGACY_TIPO_QUESTAO_TO_TYPE: Readonly<Record<number, QuestionType>> = {
  1: "DISCURSIVE",
  2: "MULTIPLE_CHOICE",
  3: "TRUE_FALSE",
  4: "RELATED_ITEMS",
  5: "CESPE",
  6: "MULTIPLE_CORRECT",
  7: "SUM_OF_CORRECT",
};

/**
 * Escala de dificuldade **legada**: 0 · 2 · 5 · 7 · 10.
 *
 * Não é 1–5. Um mapeamento ingênuo para 1–5 perderia a granularidade que o acervo já usa e
 * tornaria o import não reversível.
 */
export const DIFFICULTIES = [0, 2, 5, 7, 10] as const;

export type Difficulty = (typeof DIFFICULTIES)[number];

export const DIFFICULTY_LABELS: Readonly<Record<Difficulty, string>> = {
  0: "Muito Fácil",
  2: "Fácil",
  5: "Médio",
  7: "Difícil",
  10: "Muito Difícil",
};

export const isDifficulty = (value: number): value is Difficulty =>
  (DIFFICULTIES as readonly number[]).includes(value);

export const QUESTION_STATUSES = ["DRAFT", "READY", "ARCHIVED"] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

export const VALIDATION_STATUSES = ["UNVALIDATED", "VALID", "INVALID"] as const;
export type ValidationStatus = (typeof VALIDATION_STATUSES)[number];

/**
 * A letra exibida de uma alternativa é **projeção da ordem**, nunca identidade (spec §8.5).
 *
 * O legado guardava `Marcacao` (`a`–`e`) na linha, e é exatamente isso que quebra ao embaralhar:
 * o gabarito seguia a letra em vez de seguir a alternativa.
 */
export const optionLabelAt = (index: number): string => {
  if (index < 0) throw new RangeError(`Índice de alternativa inválido: ${index}`);

  let label = "";
  let n = index;

  do {
    label = String.fromCharCode(97 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);

  return label;
};
