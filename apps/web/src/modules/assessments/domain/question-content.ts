// Os plugins se registram ao serem importados. Sem esta linha, num processo em que ninguém mais
// os importou, `pluginFor` devolveria `null` para todo tipo e a prova inteira seria recusada.
import "@modules/questions/domain/plugins";
import { isQuestionType } from "@modules/questions/domain/question-type";
import { pluginFor } from "@modules/questions/domain/question-type-plugin";

import type { AssessmentQuestionContent } from "./assessment-template";

/**
 * A questão guardada, do jeito que a avaliação a lê.
 *
 * O tipo chega como `String` porque o conector SQLite não tem `enum`; é aqui que ele vira decisão.
 */
export interface StoredQuestion {
  readonly id: string;
  readonly type: string;
  readonly statementLatex: string;
  readonly solutionLatex: string;
  readonly options: readonly {
    readonly id: string;
    readonly statementLatex: string;
    readonly isCorrect: boolean;
  }[];
}

/**
 * O conteúdo de uma questão na prova, **perguntado ao plugin do tipo** (#262).
 *
 * A avaliação lia as alternativas sem olhar o tipo e guardava uma correta só
 * (`options.find(isCorrect)`). Com isso a múltipla escolha saía com metade do gabarito, e a
 * questão que virou discursiva saía com a)…e) impressas — embora o render da própria questão, que
 * passa pelo plugin, não as mostrasse.
 *
 * O tipo sem plugin não é adivinhado: `supported: false`, e o sorteio o recusa. Imprimir um
 * `SUM_OF_CORRECT` como se fosse escolha simples daria um gabarito errado, e um gabarito errado só
 * aparece na sala.
 */
export function assessmentContentOf(
  question: StoredQuestion,
  flags: { readonly inTrash: boolean },
): AssessmentQuestionContent {
  const plugin = isQuestionType(question.type) ? pluginFor(question.type) : null;
  const hasOptions = plugin?.options != null;
  const options = hasOptions ? question.options : [];

  return {
    questionId: question.id,
    statementLatex: question.statementLatex,
    solutionLatex: question.solutionLatex,
    supported: plugin !== null,
    hasOptions,
    options: Object.fromEntries(options.map((option) => [option.id, option.statementLatex])),
    correctOptionIds: options.filter((option) => option.isCorrect).map((option) => option.id),
    points: null,
    inTrash: flags.inTrash,
  };
}
