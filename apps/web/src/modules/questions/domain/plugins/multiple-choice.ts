import { parseLatexPreview } from "@modules/preview/domain/parse-latex-preview";
import type { PreviewBlock, PreviewItem } from "@modules/preview/domain/preview-model";

import { block, type QuestionLatexBlock } from "../question-latex";
import { optionLabelAt } from "../question-type";
import type { QuestionForPlugin, QuestionTypePlugin } from "../question-type-plugin";

import { validateCommon } from "./shared";

/**
 * Múltipla escolha, com quantidade **arbitrária** de alternativas.
 *
 * O legado fixava cinco (`a`–`e`) e guardava a letra na linha. As duas coisas eram o mesmo erro:
 * tratar a posição como identidade. Aqui a letra é projeção da ordem (D9) e o número de
 * alternativas é o que a questão tiver — o acervo tem questões de verdadeiro/falso com duas e
 * questões de concurso com seis.
 */
export const multipleChoicePlugin: QuestionTypePlugin = {
  type: "MULTIPLE_CHOICE",
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

    if (correct.length > 1) {
      // Erro, e não aviso: o tipo diz "escolha uma". Se são várias, o tipo está errado —
      // `MULTIPLE_CORRECT` existe para isso — e usar a questão assim geraria gabarito ambíguo.
      issues.push({
        severity: "error",
        code: "multiple_correct_options",
        message: `${correct.length} alternativas marcadas como corretas. Use "múltiplas corretas" se for o caso.`,
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

    const seen = new Map<string, string>();
    for (const option of question.options) {
      const key = option.statementLatex.trim();
      if (key === "") continue;
      const first = seen.get(key);
      if (first !== undefined) {
        // Duplicata é aviso: aparece em questão legítima ("nenhuma das anteriores" repetido entre
        // questões) e em erro de digitação, e só quem escreveu sabe qual dos dois.
        issues.push({
          severity: "warning",
          code: "duplicate_option",
          message: "Duas alternativas têm o mesmo texto.",
          optionId: option.id,
        });
      } else {
        seen.set(key, option.id);
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
        // O `\begin{enumerate}` é a única linha de estrutura antes da primeira alternativa, e é
        // por isso que a "linha 1" das alternativas é a alternativa `a`.
        prefixLines: 1,
      });
    }

    if (options?.includeSolution === true) {
      const correctIndex = question.options.findIndex((option) => option.isCorrect);
      const solution: string[] = [];

      if (correctIndex >= 0) {
        // A letra sai do **índice**, calculada na hora de escrever. Guardá-la seria repetir o
        // erro do legado: reordenar deixaria o gabarito apontando para a letra errada.
        solution.push("", "\\medskip", `\\textbf{Gabarito:} ${optionLabelAt(correctIndex)}.`);
      }
      if (question.solutionLatex.trim() !== "") {
        solution.push("", `\\textbf{Resolução.} ${question.solutionLatex}`);
      }

      if (solution.length > 0) {
        blocks.push({
          origin: "solutionLatex",
          lines: solution,
          // Tudo que vem antes da resolução é estrutura — inclusive a linha do gabarito, que é
          // **derivada** da alternativa correta e não existe em campo nenhum para editar.
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

  /**
   * Embaralha a **ordem**, não o gabarito.
   *
   * `isCorrect` viaja com a alternativa porque é propriedade dela, não da posição. É este teste
   * — "o gabarito sobrevive à reordenação" — que a spec pede explicitamente, e é o que o legado
   * não conseguia passar.
   */
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
