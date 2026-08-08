import type { QuestionTypePlugin } from "../question-type-plugin";

import { commonPreview, validateCommon } from "./shared";

/**
 * Questão discursiva.
 *
 * O tipo mais simples do acervo, e é ele que mostra o desenho funcionando: não tem `randomize`
 * porque não há o que embaralhar, e a ausência é **legível** — não é um método vazio herdado que
 * alguém precisa lembrar de não chamar.
 */
export const discursivePlugin: QuestionTypePlugin = {
  type: "DISCURSIVE",
  label: "Discursiva",

  validate(question) {
    const issues = [...validateCommon(question)];

    if (question.options.length > 0) {
      // Não é erro: acontece quando alguém converte uma múltipla escolha em discursiva e as
      // alternativas ficam para trás. O aviso é o que faz alguém decidir apagá-las ou reverter.
      issues.push({
        severity: "warning",
        code: "discursive_has_options",
        message: `Questão discursiva com ${question.options.length} alternativa(s) — elas não serão usadas.`,
      });
    }

    return issues;
  },

  buildLatex(question, options) {
    const parts = [question.statementLatex];

    if (options?.includeSolution === true && question.solutionLatex.trim() !== "") {
      parts.push("", "\\medskip", `\\textbf{Resposta.} ${question.solutionLatex}`);
    }

    return parts.join("\n").trim();
  },

  buildFastPreview(question) {
    return commonPreview(question);
  },
};
