import type { QuestionForPlugin, ValidationIssue } from "../question-type-plugin";

/**
 * O que todo plugin faz igual.
 *
 * Fica aqui, e não numa classe base: herança entre plugins criaria a tentação de sobrescrever
 * comportamento pela metade, e o ponto do registry é cada tipo ser lido por inteiro num arquivo só.
 */

/**
 * Cinco alternativas.
 *
 * É o formato do acervo e o do vestibular brasileiro, e é o que o design mostra na validação
 * ("✓ 5 alternativas"). Nascer com **zero** obrigaria a clicar cinco vezes antes de escrever a
 * primeira palavra; nascer com duas obrigaria a três. O número não é regra — acrescentar e remover
 * continua livre —, é onde o trabalho começa.
 */
export const DEFAULT_OPTION_COUNT = 5;

/** Validações que valem para qualquer tipo. */
export function validateCommon(question: QuestionForPlugin): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (question.statementLatex.trim() === "") {
    issues.push({
      severity: "error",
      code: "statement_empty",
      message: "A questão não tem enunciado.",
    });
  }

  if (question.solutionLatex.trim() === "") {
    // Aviso, não erro: o acervo tem centenas de questões sem resolução escrita, e marcá-las
    // inválidas faria ninguém mais olhar a lista de problemas.
    issues.push({
      severity: "warning",
      code: "solution_empty",
      message: "A questão não tem resolução.",
    });
  }

  const chaves = countUnbalanced(question.statementLatex);
  if (chaves !== 0) {
    issues.push({
      severity: "error",
      code: "unbalanced_braces",
      message:
        chaves > 0
          ? `Há ${chaves} chave(s) aberta(s) sem fechar no enunciado.`
          : `Há ${-chaves} chave(s) fechada(s) a mais no enunciado.`,
    });
  }

  if (countDollars(question.statementLatex) % 2 !== 0) {
    // Cifrão ímpar é o erro mais comum do acervo e o mais caro: o modo matemático vaza para o
    // resto do documento, e o PDF sai com metade da questão em itálico.
    issues.push({
      severity: "error",
      code: "unbalanced_math",
      message: "Há um `$` sem par no enunciado — o modo matemático ficaria aberto.",
    });
  }

  return issues;
}

/** Positivo = abriu e não fechou; negativo = fechou demais. Ignora `\{` e `\}`. */
export function countUnbalanced(latex: string): number {
  let depth = 0;
  for (let i = 0; i < latex.length; i += 1) {
    if (latex[i] === "\\") {
      i += 1;
      continue;
    }
    if (latex[i] === "{") depth += 1;
    else if (latex[i] === "}") depth -= 1;
  }
  return depth;
}

/** Conta `$` de verdade — `\$` é cifrão literal, e o acervo é de matemática financeira. */
export function countDollars(latex: string): number {
  let count = 0;
  for (let i = 0; i < latex.length; i += 1) {
    if (latex[i] === "\\") {
      i += 1;
      continue;
    }
    if (latex[i] === "$") count += 1;
  }
  return count;
}
