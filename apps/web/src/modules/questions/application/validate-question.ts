// Import de efeito colateral, e é ele que **faz a validação existir**: sem esta linha o registro
// fica vazio, `pluginFor` devolve `null` para tudo, e toda questão do acervo responde
// "tipo não suportado" — foi exatamente o que aconteceu, em silêncio, desde a Fase 7 (issue #147).
//
// Fica aqui, no caso de uso, e não em quem o chama: quem chama pode esquecer, e o resultado do
// esquecimento é um veredito errado em vez de um erro.
import "../domain/plugins";
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
  /**
   * Grava o veredito.
   *
   * `keepVersion` é a versão que o salvamento acabou de produzir, e o adaptador a usa para gravar
   * **sem mover o relógio da questão**: validação é estado derivado do texto que já foi gravado,
   * não uma edição nova. Sem isso, o token de concorrência avança depois de a resposta ter saído,
   * e o salvamento seguinte é recusado com 409 (#166).
   */
  setValidationStatus(
    questionId: string,
    status: ValidationStatus,
    keepVersion?: Date,
  ): Promise<void>;
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
  keepVersion?: Date,
): Promise<ValidationOutcome> {
  const outcome = evaluateQuestion(question);
  await writer.setValidationStatus(questionId, outcome.status, keepVersion);
  return outcome;
}
