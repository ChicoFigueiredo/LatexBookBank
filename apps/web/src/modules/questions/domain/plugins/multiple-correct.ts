import { parseLatexPreview } from "@modules/preview/domain/parse-latex-preview";
import type { PreviewBlock, PreviewItem } from "@modules/preview/domain/preview-model";

import { block, type QuestionLatexBlock } from "../question-latex";
import { optionLabelAt } from "../question-type";
import type { QuestionForPlugin, QuestionTypePlugin } from "../question-type-plugin";

import { validateCommon } from "./shared";

/**
 * Múltipla escolha: **uma ou mais** alternativas corretas.
 *
 * A diferença para a escolha simples precisa ser inequívoca (design §9), e ela não está só no
 * rótulo: a validação aqui recusa "nenhuma correta" e aceita várias, enquanto a escolha simples
 * recusa exatamente o contrário. É o que impede um gabarito ambíguo de passar sob o tipo errado.
 *
 * O `\item` sai com marcador de caixa (`$\square$`) e não com letra sozinha: quem lê a prova
 * impressa precisa ver que pode marcar mais de uma sem depender do enunciado dizer.
 */
export const multipleCorrectPlugin: QuestionTypePlugin = {
  type: "MULTIPLE_CORRECT",
  label: "Múltipla escolha",

  validate(question) {
    const issues = [...validateCommon(question)];
    const correct = question.options.filter((option) => option.isCorrect);

    if (question.options.length < 2) {
      issues.push({
        severity: "error",
        code: "too_few_options",
        message: "Múltipla escolha precisa de pelo menos duas alternativas.",
      });
    }

    if (correct.length === 0) {
      issues.push({
        severity: "error",
        code: "no_correct_option",
        message: "Nenhuma alternativa está marcada como correta.",
      });
    }

    if (correct.length === question.options.length && question.options.length > 0) {
      // Aviso, não erro: existe questão legítima em que todas valem. Mas é também o formato de
      // uma questão em que alguém marcou tudo por engano, e só quem escreveu sabe qual dos dois.
      issues.push({
        severity: "warning",
        code: "all_options_correct",
        message: "Todas as alternativas estão corretas — confira se é isso mesmo.",
      });
    }

    if (correct.length === 1) {
      // Aviso: uma correta só funciona, mas é escolha simples disfarçada — e o tipo errado muda
      // como a prova é impressa e como o aluno responde.
      issues.push({
        severity: "warning",
        code: "single_correct_option",
        message: 'Só uma alternativa correta. Se for sempre assim, o tipo é "escolha simples".',
      });
    }

    for (const option of question.options) {
      if (option.statementLatex.trim() === "") {
        issues.push({
          severity: "error",
          code: "empty_option",
          message: "Há alternativa vazia.",
          optionId: option.id,
        });
      }
    }

    return issues;
  },

  buildLatexBlocks(question, options) {
    const blocks: QuestionLatexBlock[] = [block("statementLatex", question.statementLatex)];

    if (question.options.length > 0) {
      blocks.push({
        origin: "options",
        lines: [
          "\\begin{enumerate}[label=\\alph*), itemsep=2pt, topsep=4pt]",
          ...question.options.map((option) => `  \\item ${option.statementLatex}`),
          "\\end{enumerate}",
        ],
        prefixLines: 1,
      });
    }

    if (options?.includeSolution === true) {
      const solution: string[] = [];

      // **Todas** as corretas, na ordem em que aparecem — as letras saem do índice, calculadas na
      // hora de escrever. É a mesma regra da escolha simples; o que muda é serem várias.
      const correct = question.options
        .map((option, index) => ({ option, index }))
        .filter((entry) => entry.option.isCorrect)
        .map((entry) => optionLabelAt(entry.index));

      if (correct.length > 0) {
        solution.push("", "\\medskip", `\\textbf{Gabarito:} ${correct.join(", ")}.`);
      }
      if (question.solutionLatex.trim() !== "") {
        solution.push("", `\\textbf{Resolução.} ${question.solutionLatex}`);
      }

      if (solution.length > 0) {
        blocks.push({
          origin: "solutionLatex",
          lines: solution,
          prefixLines: solution.length - 1,
        });
      }

      if (question.complementLatex.trim() !== "") {
        blocks.push({
          origin: "complementLatex",
          lines: ["", "\\medskip", `\\textbf{Complemento.} ${question.complementLatex}`],
          prefixLines: 2,
        });
      }
    }

    return blocks;
  },

  buildFastPreview(question) {
    const items: PreviewItem[] = question.options.map((option) => ({
      blocks: parseLatexPreview(option.statementLatex),
    }));

    const blocks: PreviewBlock[] = [...parseLatexPreview(question.statementLatex)];
    if (items.length > 0) blocks.push({ kind: "list", ordered: true, items });

    return blocks;
  },

  /** Embaralha a ordem; `isCorrect` viaja com a alternativa, nunca com a posição (D9). */
  randomize(question: QuestionForPlugin, random: () => number): QuestionForPlugin {
    const shuffled = [...question.options];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      const a = shuffled[i];
      const b = shuffled[j];
      if (a !== undefined && b !== undefined) {
        shuffled[i] = b;
        shuffled[j] = a;
      }
    }
    return { ...question, options: shuffled };
  },
};
