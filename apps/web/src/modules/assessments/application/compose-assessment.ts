import {
  renderAssessment,
  TEMPLATE_AUDIENCES,
  type AssessmentHeader,
  type AssessmentQuestionContent,
  type TemplateAudience,
  type TemplateOptions,
} from "../domain/assessment-template";
import { answerKey, buildVariant, type Variant } from "../domain/variant";

/**
 * Da avaliação guardada às três versões impressas.
 *
 * O que este arquivo acrescenta ao domínio é a **ordem**: sortear uma vez e usar a mesma variante
 * nas três chamadas. Sortear por versão daria três provas diferentes com o mesmo nome — a do
 * aluno com a resposta em `c`, a do professor com ela em `a` —, que é o pior defeito possível
 * numa prova, porque só aparece na correção.
 *
 * Ver spec §20 · D9 · issue #143.
 */

export interface AssessmentItemRecord {
  readonly questionId: string;
  readonly points: number | null;
  readonly pinnedLastOptionIds: readonly string[];
}

export interface AssessmentRecord {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly notes: string | null;
  readonly items: readonly AssessmentItemRecord[];
}

export interface VariantSpec {
  readonly label: string;
  readonly seed: number;
  readonly shuffleQuestions: boolean;
  readonly shuffleOptions: boolean;
}

export class EmptyAssessmentError extends Error {
  constructor() {
    super("Esta avaliação não tem nenhuma questão — não há prova a gerar.");
    this.name = "EmptyAssessmentError";
  }
}

export class MissingQuestionError extends Error {
  constructor(readonly questionId: string) {
    super(`A questão \`${questionId}\` está na prova mas não foi encontrada no acervo.`);
    this.name = "MissingQuestionError";
  }
}

/**
 * Sorteia a variante a partir do conteúdo real das questões.
 *
 * O conteúdo entra inteiro, e não só a contagem de alternativas: o sorteio precisa dos **ids**,
 * porque é o id que a variante guarda. Contar alternativas e gerar posições daria um mapa que
 * aponta para "a terceira", e a terceira muda quando alguém edita a questão.
 */
export function composeVariant(
  assessment: AssessmentRecord,
  spec: VariantSpec,
  content: Readonly<Record<string, AssessmentQuestionContent>>,
): Variant {
  if (assessment.items.length === 0) throw new EmptyAssessmentError();

  return buildVariant({
    label: spec.label,
    seed: spec.seed,
    shuffleQuestions: spec.shuffleQuestions,
    questions: assessment.items.map((item) => {
      const question = content[item.questionId];
      if (question === undefined) throw new MissingQuestionError(item.questionId);

      return {
        questionId: item.questionId,
        optionIds: Object.keys(question.options),
        pinnedLastOptionIds: item.pinnedLastOptionIds,
        shuffleOptions: spec.shuffleOptions,
      };
    }),
  });
}

export interface ComposedVersions {
  readonly variant: Variant;
  /** `questionId` → letra da correta, na **letra que foi impressa**. */
  readonly answers: Readonly<Record<string, string>>;
  readonly latexByAudience: Readonly<Record<TemplateAudience, string>>;
}

/**
 * As três versões, da **mesma** variante.
 *
 * O gabarito sai do mapa de letras, não de um novo sorteio — é a diferença entre conferir contra
 * o que foi impresso e torcer para dar o mesmo.
 */
export function composeVersions(
  assessment: AssessmentRecord,
  variant: Variant,
  content: Readonly<Record<string, AssessmentQuestionContent>>,
  options?: TemplateOptions,
): ComposedVersions {
  const header: AssessmentHeader = {
    title: assessment.title,
    subtitle: assessment.subtitle,
    notes: assessment.notes,
    variantLabel: variant.label,
  };

  const correctByQuestion: Record<string, string> = {};
  for (const question of variant.questions) {
    const correct = content[question.questionId]?.correctOptionId;
    if (correct !== null && correct !== undefined) {
      correctByQuestion[question.questionId] = correct;
    }
  }

  const latexByAudience = Object.fromEntries(
    TEMPLATE_AUDIENCES.map((audience) => [
      audience,
      renderAssessment({
        audience,
        header,
        variant,
        content,
        ...(options === undefined ? {} : { options }),
      }),
    ]),
  ) as Record<TemplateAudience, string>;

  return { variant, answers: answerKey(variant, correctByQuestion), latexByAudience };
}
