import {
  pluginFor,
  type QuestionForPlugin,
  type ValidationIssue,
} from "../domain/question-type-plugin";
import type { ValidationStatus } from "../domain/question-type";

/**
 * Valida uma questão e grava o resultado.
 *
 * A validação em si é do plugin (#79); o que este arquivo acrescenta é a decisão de **como o
 * resultado vira estado**: `VALID` só quando não há erro, `INVALID` quando há. Aviso não invalida
 * — o acervo tem centenas de questões com aviso legítimo, e marcá-las inválidas faria a lista de
 * problemas virar ruído que ninguém abre.
 */

export interface ValidationOutcome {
  readonly status: ValidationStatus;
  readonly issues: readonly ValidationIssue[];
  /** `true` quando o tipo da questão ainda não tem plugin. */
  readonly unsupported: boolean;
}

export interface ValidationWriter {
  setValidationStatus(questionId: string, status: ValidationStatus): Promise<void>;
}

export function evaluateQuestion(question: QuestionForPlugin): ValidationOutcome {
  const plugin = pluginFor(question.type);

  if (plugin === null) {
    // Sem plugin, a questão fica `UNVALIDATED` — e não `INVALID`. Dizer que ela está errada
    // seria mentira: o que falta é o produto saber avaliá-la.
    return { status: "UNVALIDATED", issues: [], unsupported: true };
  }

  const issues = plugin.validate(question);
  const hasError = issues.some((issue) => issue.severity === "error");

  return { status: hasError ? "INVALID" : "VALID", issues, unsupported: false };
}

export async function validateAndPersist(
  writer: ValidationWriter,
  questionId: string,
  question: QuestionForPlugin,
): Promise<ValidationOutcome> {
  const outcome = evaluateQuestion(question);
  await writer.setValidationStatus(questionId, outcome.status);
  return outcome;
}
