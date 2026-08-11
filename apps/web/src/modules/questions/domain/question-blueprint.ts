import { generateNKeysBetween } from "@modules/document-tree/domain/fractional-index";

import { QUESTION_TYPES, type Difficulty, type QuestionType, isDifficulty } from "./question-type";

/**
 * Com o que uma questão nasce.
 *
 * O design pede que criar questão seja **ação de primeira classe** (§7 dos ajustes finais): não
 * "novo nó → transformar em questão", mas escolher o tipo e já receber a estrutura montada. Este
 * arquivo é a parte dessa decisão que não depende de banco nenhum: quantas alternativas, com que
 * ordem, e o que é recusado antes de qualquer escrita.
 */

export class InvalidQuestionTypeError extends Error {
  constructor(readonly received: unknown) {
    super(`Tipo de questão inválido. Use um de: ${QUESTION_TYPES.join(", ")}.`);
    this.name = "InvalidQuestionTypeError";
  }
}

/**
 * Cinco alternativas.
 *
 * É o formato do acervo e o do vestibular brasileiro, e é o que o design mostra na validação
 * ("✓ 5 alternativas"). Nascer com **zero** obrigaria a clicar cinco vezes antes de escrever a
 * primeira palavra; nascer com duas obrigaria a três. O número não é regra — acrescentar e remover
 * continua livre —, é onde o trabalho começa.
 */
export const DEFAULT_OPTION_COUNT = 5;

/** Tipos que o Beta oferece na criação, na ordem em que o menu os mostra. */
export const CREATABLE_TYPES: readonly QuestionType[] = [
  "MULTIPLE_CHOICE",
  "MULTIPLE_CORRECT",
  "DISCURSIVE",
];

export interface QuestionBlueprint {
  readonly type: QuestionType;
  readonly difficulty: Difficulty;
  /** `sortKey` de cada alternativa inicial, já em ordem. Vazio para discursiva. */
  readonly optionSortKeys: readonly string[];
}

export function parseQuestionType(value: unknown): QuestionType {
  if (typeof value !== "string" || !(QUESTION_TYPES as readonly string[]).includes(value)) {
    throw new InvalidQuestionTypeError(value);
  }
  return value as QuestionType;
}

/**
 * Quantas alternativas o tipo pede ao nascer.
 *
 * Um `Map` e não `switch`: o teste de fronteira varre o código atrás de `switch` sobre tipo de
 * questão, e a regra está certa — com `switch`, o oitavo tipo obriga a caçar todos os lugares que
 * decidem por tipo, e o esquecido não dá erro de compilação, dá comportamento errado numa tela só.
 *
 * Ausente do mapa significa "sem alternativas", que é o padrão seguro: um tipo novo aparece com
 * zero e alguém decide, em vez de aparecer com cinco que ninguém escolheu.
 */
const INITIAL_OPTIONS: ReadonlyMap<QuestionType, number> = new Map([
  ["MULTIPLE_CHOICE", DEFAULT_OPTION_COUNT],
  ["MULTIPLE_CORRECT", DEFAULT_OPTION_COUNT],
  ["TRUE_FALSE", 2],
  ["CESPE", 2],
]);

export function planQuestion(input: {
  readonly type: unknown;
  readonly difficulty?: unknown;
  readonly optionCount?: unknown;
}): QuestionBlueprint {
  const type = parseQuestionType(input.type);

  const requested = input.optionCount === undefined ? null : Number(input.optionCount);
  const count =
    requested !== null && Number.isInteger(requested) && requested >= 0 && requested <= 26
      ? requested
      : (INITIAL_OPTIONS.get(type) ?? 0);

  const difficulty =
    typeof input.difficulty === "number" && isDifficulty(input.difficulty) ? input.difficulty : 5;

  return {
    type,
    difficulty,
    // Índices fracionários desde o nascimento, e não `a0`…`a4` inventados aqui: é o mesmo
    // gerador da árvore, e é o que faz "inserir uma alternativa entre a segunda e a terceira"
    // não reescrever a lista inteira depois.
    optionSortKeys: count === 0 ? [] : generateNKeysBetween(null, null, count),
  };
}
