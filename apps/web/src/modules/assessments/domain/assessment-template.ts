import { optionLabelAt } from "@modules/questions/domain/question-type";

import type { Variant } from "./variant";

/**
 * As três versões de uma prova, **do mesmo sorteio**.
 *
 * É a razão de o template ser separado da variante. Se cada versão embaralhasse por conta
 * própria, o gabarito do professor não corresponderia à prova do aluno — e ninguém perceberia até
 * a correção, quando já não há o que fazer.
 *
 * Aqui o template decide **apresentação** (o que aparece, com que cabeçalho) e a variante decide
 * **conteúdo** (qual questão, em que ordem, com que letra). As três leem a mesma variante.
 *
 * Ver spec §20 · issue #129.
 */

export const TEMPLATE_AUDIENCES = ["STUDENT", "TEACHER", "ANSWER_KEY"] as const;
export type TemplateAudience = (typeof TEMPLATE_AUDIENCES)[number];

export interface AssessmentQuestionContent {
  readonly questionId: string;
  readonly statementLatex: string;
  readonly solutionLatex: string;
  readonly options: Readonly<Record<string, string>>;
  /** `optionId` da correta, quando há uma. */
  readonly correctOptionId: string | null;
  readonly points: number | null;
}

export interface AssessmentHeader {
  readonly title: string;
  readonly subtitle: string | null;
  readonly notes: string | null;
  readonly variantLabel: string;
}

export interface TemplateOptions {
  /** Espaço em branco depois de cada questão discursiva, em centímetros. */
  readonly answerSpaceCm?: number;
  readonly showPoints?: boolean;
  readonly preambleLatex?: string;
}

const DEFAULT_PREAMBLE = [
  "\\documentclass[11pt,a4paper]{article}",
  "\\usepackage[T1]{fontenc}",
  "\\usepackage[utf8]{inputenc}",
  "\\usepackage[brazil]{babel}",
  "\\usepackage[margin=2.2cm]{geometry}",
  "\\usepackage{amsmath,amssymb}",
  "\\usepackage{enumitem}",
  "\\usepackage{siunitx}",
  // O acervo usa `\real` como unidade monetária, e sem esta linha metade das questões não
  // compila — descoberto compilando questão de verdade, na Fase 6.
  "\\DeclareSIUnit{\\real}{R\\$}",
  "\\pagestyle{plain}",
].join("\n");

/**
 * Monta o LaTeX de uma versão.
 *
 * A `variant` é a mesma nas três chamadas — é o que garante que a letra impressa na prova do
 * aluno é a letra que o gabarito do professor cita.
 */
export function renderAssessment(input: {
  readonly audience: TemplateAudience;
  readonly header: AssessmentHeader;
  readonly variant: Variant;
  readonly content: Readonly<Record<string, AssessmentQuestionContent>>;
  readonly options?: TemplateOptions;
}): string {
  const options = input.options ?? {};
  const preamble = options.preambleLatex ?? DEFAULT_PREAMBLE;

  const body =
    input.audience === "ANSWER_KEY"
      ? answerKeyBody(input.variant, input.content)
      : questionsBody(input.audience, input.variant, input.content, options);

  return [
    preamble,
    "",
    "\\begin{document}",
    "",
    ...headerLines(input.header, input.audience),
    "",
    body,
    "",
    "\\end{document}",
    "",
  ].join("\n");
}

function headerLines(header: AssessmentHeader, audience: TemplateAudience): string[] {
  const suffix =
    audience === "TEACHER"
      ? " \\hfill \\textbf{[PROFESSOR]}"
      : audience === "ANSWER_KEY"
        ? " \\hfill \\textbf{[GABARITO]}"
        : "";

  return [
    "\\begin{center}",
    `  {\\Large \\textbf{${escapeText(header.title)}}}${suffix}\\\\[2pt]`,
    ...(header.subtitle ? [`  {\\large ${escapeText(header.subtitle)}}\\\\[2pt]`] : []),
    `  {\\small Versão ${escapeText(header.variantLabel)}}`,
    "\\end{center}",
    ...(header.notes && audience !== "ANSWER_KEY"
      ? ["", "\\noindent", escapeText(header.notes), ""]
      : []),
    // Linha para nome e turma só na versão do aluno: é ele quem preenche.
    ...(audience === "STUDENT"
      ? ["", "\\noindent Nome: \\hrulefill\\ Turma: \\rule{3cm}{0.4pt}", "", "\\vspace{4pt}\\hrule"]
      : ["", "\\hrule"]),
  ];
}

function questionsBody(
  audience: TemplateAudience,
  variant: Variant,
  content: Readonly<Record<string, AssessmentQuestionContent>>,
  options: TemplateOptions,
): string {
  const parts: string[] = ["\\begin{enumerate}[leftmargin=*, itemsep=10pt]"];

  for (const question of variant.questions) {
    const item = content[question.questionId];
    // Questão sem conteúdo é dado incoerente. Pular em silêncio produziria uma prova com uma
    // questão a menos e numeração que não bate com o gabarito.
    if (item === undefined) {
      throw new Error(`Sem conteúdo para a questão \`${question.questionId}\`.`);
    }

    const points =
      options.showPoints === true && item.points !== null
        ? ` \\hfill {\\small (${formatPoints(item.points)} pt)}`
        : "";

    parts.push(`  \\item ${item.statementLatex}${points}`);

    if (question.optionIds.length > 0) {
      parts.push("  \\begin{enumerate}[label=\\alph*), itemsep=2pt, topsep=4pt]");

      for (const optionId of question.optionIds) {
        const text = item.options[optionId] ?? "";
        // Na versão do professor a correta vem marcada **no lugar dela**, não numa lista à parte:
        // corrigir olhando a prova é o gesto real, e uma lista no fim obrigaria a ir e voltar.
        const mark =
          audience === "TEACHER" && optionId === item.correctOptionId ? "\\textbf{[X]} " : "";
        parts.push(`    \\item ${mark}${text}`);
      }

      parts.push("  \\end{enumerate}");
    } else if (audience === "STUDENT" && (options.answerSpaceCm ?? 0) > 0) {
      // Espaço para responder, só na prova do aluno: na do professor ele empurraria a resolução
      // para longe do enunciado.
      parts.push(`  \\vspace{${(options.answerSpaceCm ?? 0).toFixed(1)}cm}`);
    }

    if (audience === "TEACHER" && item.solutionLatex.trim() !== "") {
      parts.push("", `  \\textbf{Resolução.} ${item.solutionLatex}`, "");
    }
  }

  parts.push("\\end{enumerate}");
  return parts.join("\n");
}

/**
 * O gabarito, em tabela.
 *
 * Sai do **mapa da variante**, não de um novo sorteio — é a diferença entre conferir contra o que
 * foi impresso e torcer para dar o mesmo.
 */
function answerKeyBody(
  variant: Variant,
  content: Readonly<Record<string, AssessmentQuestionContent>>,
): string {
  const rows: string[] = [];

  for (const [index, question] of variant.questions.entries()) {
    const item = content[question.questionId];
    if (item === undefined) {
      throw new Error(`Sem conteúdo para a questão \`${question.questionId}\`.`);
    }

    const label =
      item.correctOptionId === null
        ? "---"
        : (question.labelByOptionId[item.correctOptionId] ?? "?");

    rows.push(`${index + 1} & ${label} \\\\`);
  }

  return [
    "\\begin{center}",
    "\\begin{tabular}{|c|c|}",
    "\\hline",
    "\\textbf{Questão} & \\textbf{Resposta} \\\\",
    "\\hline",
    ...rows,
    "\\hline",
    "\\end{tabular}",
    "\\end{center}",
  ].join("\n");
}

const formatPoints = (points: number): string =>
  Number.isInteger(points) ? String(points) : points.toFixed(1).replace(".", ",");

/**
 * Escapa texto que vai para o LaTeX.
 *
 * Só o cabeçalho passa por aqui — título, subtítulo e instruções são texto do usuário, e um `&`
 * num título quebraria a compilação. O enunciado **não** é escapado: ele já é LaTeX, e escapá-lo
 * transformaria `\frac{1}{2}` em texto literal.
 */
export function escapeText(text: string): string {
  return text.replace(/([&%$#_{}])/g, "\\$1").replace(/([~^])/g, "\\$1{}");
}

/** A letra que uma posição recebe. Reexportado para a tela não recalcular por conta própria. */
export { optionLabelAt };
