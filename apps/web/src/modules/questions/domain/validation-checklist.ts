import type { QuestionForPlugin, ValidationIssue } from "./question-type-plugin";

/**
 * A validação como **lista de verificação**, não como lista de defeitos.
 *
 * O design (§25 dos ajustes finais) pede as duas metades:
 *
 * ```text
 * ✓ Enunciado preenchido      ! Nenhuma alternativa correta definida
 * ✓ 5 alternativas
 * ✓ 1 correta
 * ```
 *
 * A diferença não é estética. Uma lista só de erros não distingue "esta questão está pronta" de
 * "esta questão nunca foi conferida" — nos dois casos ela aparece vazia. Com os itens satisfeitos
 * visíveis, o vazio deixa de existir: ou há um `✓`, ou há um `!`.
 *
 * O que existia antes disto era só o selo `INVALID` na árvore, gravado em silêncio a cada
 * salvamento. Ele dizia que havia algo errado e **nunca o quê** — a questão ficava vermelha e o
 * autor tinha que adivinhar.
 */

export type CheckState = "ok" | "error" | "warning" | "pending";

export interface Check {
  readonly id: string;
  readonly state: CheckState;
  readonly label: string;
  /** Detalhe curto, quando ajuda: "3 de 5 preenchidas". */
  readonly detail?: string;
}

export interface ChecklistInput {
  readonly question: QuestionForPlugin;
  readonly issues: readonly ValidationIssue[];
  /** Estado do último render autoritativo, quando houve algum. */
  readonly lastRenderState: "DONE" | "FAILED" | "QUEUED" | "RUNNING" | "CANCELLED" | null;
  /** `true` quando o tipo ainda não tem plugin — o veredito não é "errado", é "não sei". */
  readonly unsupported: boolean;
}

/** Códigos que dizem respeito à sintaxe LaTeX, e não à estrutura da questão. */
const LATEX_CODES = new Set(["unbalanced_braces", "unbalanced_math"]);

export function buildChecklist(input: ChecklistInput): readonly Check[] {
  const { question, issues, lastRenderState, unsupported } = input;

  if (unsupported) {
    return [
      {
        id: "type",
        state: "pending",
        label: "Tipo sem validação automática",
        detail: question.type,
      },
    ];
  }

  const has = (code: string) => issues.some((issue) => issue.code === code);
  const correct = question.options.filter((option) => option.isCorrect).length;
  const empty = question.options.filter((option) => option.statementLatex.trim() === "").length;

  const checks: Check[] = [
    {
      id: "statement",
      state: has("statement_empty") ? "error" : "ok",
      label: has("statement_empty") ? "Enunciado vazio" : "Enunciado preenchido",
    },
  ];

  // Discursiva não mostra linha de alternativa nenhuma — não é que estejam faltando, é que não
  // existem (design §10). Uma linha "0 alternativas" ali seria um problema inventado.
  if (question.options.length > 0 || has("too_few_options")) {
    checks.push({
      id: "options",
      state: has("too_few_options") ? "error" : empty > 0 ? "error" : "ok",
      label:
        empty > 0
          ? `${empty} ${empty === 1 ? "alternativa vazia" : "alternativas vazias"}`
          : `${question.options.length} alternativas`,
      ...(empty > 0 ? { detail: `${question.options.length - empty} preenchidas` } : {}),
    });

    checks.push({
      id: "answer-key",
      state: has("no_correct_option") || has("multiple_correct_options") ? "error" : "ok",
      label: has("no_correct_option")
        ? "Nenhuma alternativa correta definida"
        : has("multiple_correct_options")
          ? `${correct} corretas — o tipo aceita uma`
          : `${correct} ${correct === 1 ? "correta" : "corretas"}`,
    });
  }

  const latexIssue = issues.find((issue) => LATEX_CODES.has(issue.code));
  checks.push({
    id: "latex",
    state: latexIssue ? "error" : "ok",
    label: latexIssue ? "LaTeX com problema" : "LaTeX válido",
    ...(latexIssue ? { detail: latexIssue.message } : {}),
  });

  checks.push({
    id: "render",
    state:
      lastRenderState === "DONE"
        ? "ok"
        : lastRenderState === "FAILED"
          ? "error"
          : // `pending` e não `warning`: nunca ter compilado não é defeito da questão. É trabalho
            // que ainda não foi feito, e a diferença importa para quem olha a lista decidindo o
            // que corrigir.
            "pending",
    label:
      lastRenderState === "DONE"
        ? "Render concluído"
        : lastRenderState === "FAILED"
          ? "Render falhou"
          : lastRenderState === null
            ? "Ainda não compilada"
            : "Compilando…",
  });

  // Os avisos vêm por último e sempre depois dos erros: são o que "pode estar errado", e misturá-
  // los com o que "impede de usar" faria as duas coisas perderem o peso.
  for (const issue of issues.filter((entry) => entry.severity === "warning")) {
    checks.push({ id: `warn-${issue.code}`, state: "warning", label: issue.message });
  }

  return checks;
}

/** `true` quando nada impede a questão de ser usada. Aviso não impede. */
export const isUsable = (checks: readonly Check[]): boolean =>
  !checks.some((check) => check.state === "error");
