import { generateNKeysBetween } from "@/shared/ordering/fractional-index";

// Os plugins se registram ao serem importados, e é o registry que diz o que pode nascer.
import "./plugins";
import { type Difficulty, type QuestionType, isDifficulty, isQuestionType } from "./question-type";
import { optionsOf, pluginFor, registeredTypes } from "./question-type-plugin";

export { DEFAULT_OPTION_COUNT } from "./plugins/shared";

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
    super(`Tipo de questão inválido. Use um de: ${registeredTypes().join(", ")}.`);
    this.name = "InvalidQuestionTypeError";
  }
}

export interface QuestionBlueprint {
  readonly type: QuestionType;
  readonly difficulty: Difficulty;
  /** `sortKey` de cada alternativa inicial, já em ordem. Vazio para discursiva. */
  readonly optionSortKeys: readonly string[];
}

/**
 * O tipo de uma questão **que vai nascer**: do vocabulário, e com plugin.
 *
 * Só com plugin: `CESPE` está no vocabulário legado, mas sem plugin a questão nasceria sem
 * validação, sem corpo LaTeX e sem gabarito. O vocabulário inteiro continua valendo para **ler** o
 * acervo — é a criação que se restringe ao que o produto sabe tratar.
 */
export function parseQuestionType(value: unknown): QuestionType {
  if (typeof value !== "string" || !isQuestionType(value) || pluginFor(value) === null) {
    throw new InvalidQuestionTypeError(value);
  }
  return value;
}

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
      : // Quantas nascem é o plugin quem diz; o tipo sem alternativas nasce com zero.
        (optionsOf(type)?.initial ?? 0);

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
