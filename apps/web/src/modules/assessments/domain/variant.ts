import { optionLabelAt } from "@modules/questions/domain/question-type";

import { createPrng, shuffle, type Prng } from "./prng";

/**
 * Uma variante de prova: as questões numa ordem, as alternativas noutra, e **o mapa de letras**.
 *
 * O mapa é a peça que impede o gabarito de se perder. A letra é projeção da posição embaralhada
 * (D9/§8.5) — na variante A a resposta certa é `c)`, na B é `a)`, e as duas apontam para a mesma
 * `optionId`. Sem guardar a correspondência, corrigir a prova depois exigiria refazer o
 * embaralhamento e torcer para que nada tenha mudado no meio.
 *
 * Guardar a **seed** não substitui o mapa: ela reproduz a permutação, mas só enquanto a questão
 * tiver exatamente as mesmas alternativas. Uma alternativa acrescentada meses depois mudaria o
 * resultado, e a prova já impressa não muda junto.
 *
 * Ver spec §20 · D9 · issue #127.
 */

export interface VariantQuestionInput {
  readonly questionId: string;
  readonly optionIds: readonly string[];
  /** Alternativas que não se movem — "nenhuma das anteriores" no fim, por exemplo. */
  readonly pinnedLastOptionIds?: readonly string[];
  readonly shuffleOptions?: boolean;
}

export interface VariantQuestion {
  readonly questionId: string;
  /** Ordem final das alternativas, por id. */
  readonly optionIds: readonly string[];
  /** `optionId` → letra exibida. É o que permite corrigir a prova depois. */
  readonly labelByOptionId: Readonly<Record<string, string>>;
}

export interface Variant {
  readonly label: string;
  readonly seed: number;
  readonly questions: readonly VariantQuestion[];
}

export interface BuildVariantInput {
  readonly label: string;
  readonly seed: number;
  readonly questions: readonly VariantQuestionInput[];
  readonly shuffleQuestions?: boolean;
}

/**
 * Monta a variante.
 *
 * A ordem das operações é parte do contrato: **primeiro as questões, depois as alternativas de
 * cada uma, na ordem final**. Trocar isso muda toda a saída para a mesma seed — e o requisito da
 * fase é que a mesma seed dê a mesma prova, o que inclui não mexer nisto depois.
 */
export function buildVariant(input: BuildVariantInput): Variant {
  const prng = createPrng(input.seed);

  const questions =
    input.shuffleQuestions === true ? shuffle(input.questions, prng) : [...input.questions];

  return {
    label: input.label,
    seed: input.seed,
    questions: questions.map((question) => buildQuestion(question, prng)),
  };
}

function buildQuestion(question: VariantQuestionInput, prng: Prng): VariantQuestion {
  const pinned = new Set(question.pinnedLastOptionIds ?? []);

  const movable = question.optionIds.filter((id) => !pinned.has(id));
  // Presas ficam no fim, na ordem original: "nenhuma das anteriores" antes de uma alternativa
  // comum não é embaralhamento, é erro de prova.
  const fixed = question.optionIds.filter((id) => pinned.has(id));

  const ordered =
    question.shuffleOptions === false
      ? [...movable, ...fixed]
      : [...shuffle(movable, prng), ...fixed];

  const labelByOptionId: Record<string, string> = {};
  for (const [index, id] of ordered.entries()) {
    // A letra vem da posição **na variante**, e é só projeção — o endereço continua sendo o id.
    labelByOptionId[id] = optionLabelAt(index);
  }

  return { questionId: question.questionId, optionIds: ordered, labelByOptionId };
}

/**
 * O gabarito de uma variante: a letra que a resposta certa recebeu.
 *
 * Sai do mapa, e não de um novo embaralhamento — é a diferença entre "conferir contra o que foi
 * impresso" e "torcer para dar o mesmo".
 */
export function answerKey(
  variant: Variant,
  correctByQuestion: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  const key: Record<string, string> = {};

  for (const question of variant.questions) {
    const correctOptionId = correctByQuestion[question.questionId];
    if (correctOptionId === undefined) continue;

    const label = question.labelByOptionId[correctOptionId];
    // Alternativa correta que não está na variante é dado incoerente, não um caso a preencher com
    // um traço: quem monta a prova precisa saber antes de imprimi-la.
    if (label === undefined) {
      throw new Error(
        `A questão \`${question.questionId}\` marca como correta uma alternativa que não está na variante.`,
      );
    }

    key[question.questionId] = label;
  }

  return key;
}

/**
 * Um resumo estável da variante, para comparar duas execuções.
 *
 * Ordenado e sem espaço supérfluo: é o que torna "byte a byte" uma afirmação verificável em vez
 * de uma figura de linguagem.
 */
export function fingerprint(variant: Variant): string {
  return JSON.stringify({
    label: variant.label,
    seed: variant.seed,
    questions: variant.questions.map((question) => ({
      questionId: question.questionId,
      optionIds: question.optionIds,
      labels: Object.keys(question.labelByOptionId)
        .sort()
        .map((id) => `${id}=${question.labelByOptionId[id]}`),
    })),
  });
}
