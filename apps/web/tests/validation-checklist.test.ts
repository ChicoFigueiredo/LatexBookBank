import { describe, expect, it } from "vitest";

import {
  buildChecklist,
  isUsable,
  type Check,
} from "@modules/questions/domain/validation-checklist";
import type { QuestionForPlugin, ValidationIssue } from "@modules/questions/domain/question-type-plugin";

/**
 * Slice 5 — a validação vira frase.
 *
 * A validação já rodava a cada salvamento e gravava `VALID`/`INVALID`; o que faltava era o
 * **motivo** chegar à tela. Uma lista só de defeitos não bastaria: ela não distingue "questão
 * pronta" de "questão nunca conferida" — nos dois casos aparece vazia.
 */

const question = (over: Partial<QuestionForPlugin> = {}): QuestionForPlugin => ({
  type: "MULTIPLE_CHOICE",
  statementLatex: "Quanto é $2+2$?",
  solutionLatex: "É $4$.",
  complementLatex: "",
  options: [
    { id: "o1", statementLatex: "3", isCorrect: false },
    { id: "o2", statementLatex: "4", isCorrect: true },
  ],
  ...over,
});

const build = (
  over: Partial<Parameters<typeof buildChecklist>[0]> = {},
): readonly Check[] =>
  buildChecklist({
    question: question(),
    issues: [],
    lastRenderState: null,
    unsupported: false,
    ...over,
  });

const labelOf = (checks: readonly Check[], id: string) =>
  checks.find((check) => check.id === id)?.label;
const stateOf = (checks: readonly Check[], id: string) =>
  checks.find((check) => check.id === id)?.state;

const issue = (code: string, severity: "error" | "warning" = "error"): ValidationIssue => ({
  code,
  severity,
  message: `problema: ${code}`,
});

describe("a lista de verificação", () => {
  it("mostra o que está certo, não só o que está errado", () => {
    // É a diferença entre "conferida e pronta" e "nunca conferida": as duas apareceriam vazias
    // numa lista só de defeitos.
    const checks = build();

    expect(labelOf(checks, "statement")).toBe("Enunciado preenchido");
    expect(labelOf(checks, "options")).toBe("2 alternativas");
    expect(labelOf(checks, "answer-key")).toBe("1 correta");
    expect(labelOf(checks, "latex")).toBe("LaTeX válido");
    expect(isUsable(checks)).toBe(true);
  });

  it("nomeia o problema do gabarito com as palavras do design", () => {
    const checks = build({ issues: [issue("no_correct_option")] });

    expect(labelOf(checks, "answer-key")).toBe("Nenhuma alternativa correta definida");
    expect(isUsable(checks)).toBe(false);
  });

  it("não inventa linha de alternativa para discursiva", () => {
    // O design §10 é explícito: discursiva não mostra área vazia de alternativas. Uma linha
    // "0 alternativas" ali seria um problema inventado.
    const checks = build({ question: question({ type: "DISCURSIVE", options: [] }) });

    expect(checks.some((check) => check.id === "options")).toBe(false);
    expect(checks.some((check) => check.id === "answer-key")).toBe(false);
  });

  it("conta alternativas vazias e diz quantas sobraram", () => {
    const checks = build({
      question: question({
        options: [
          { id: "o1", statementLatex: "3", isCorrect: true },
          { id: "o2", statementLatex: "  ", isCorrect: false },
          { id: "o3", statementLatex: "", isCorrect: false },
        ],
      }),
    });

    expect(labelOf(checks, "options")).toBe("2 alternativas vazias");
    expect(stateOf(checks, "options")).toBe("error");
  });

  it("separa problema de LaTeX de problema de estrutura", () => {
    const checks = build({ issues: [issue("unbalanced_math")] });

    expect(stateOf(checks, "latex")).toBe("error");
    // O enunciado continua "preenchido": chave sem par não é enunciado vazio, e juntar os dois
    // faria a correção começar pelo lugar errado.
    expect(stateOf(checks, "statement")).toBe("ok");
  });

  it("nunca ter compilado é **pendente**, não erro", () => {
    // Não é defeito da questão — é trabalho que ainda não foi feito, e a diferença importa para
    // quem olha a lista decidindo o que corrigir.
    expect(stateOf(build({ lastRenderState: null }), "render")).toBe("pending");
    expect(stateOf(build({ lastRenderState: "DONE" }), "render")).toBe("ok");
    expect(stateOf(build({ lastRenderState: "FAILED" }), "render")).toBe("error");

    expect(isUsable(build({ lastRenderState: null }))).toBe(true);
    expect(isUsable(build({ lastRenderState: "FAILED" }))).toBe(false);
  });

  it("aviso não impede o uso, e vem depois dos erros", () => {
    const checks = build({ issues: [issue("solution_empty", "warning")] });

    expect(isUsable(checks)).toBe(true);
    expect(checks[checks.length - 1]?.state).toBe("warning");
  });

  it("tipo sem plugin diz 'não sei avaliar', não 'está errado'", () => {
    const checks = build({ unsupported: true, question: question({ type: "CESPE" }) });

    expect(checks).toHaveLength(1);
    expect(checks[0]?.state).toBe("pending");
    expect(isUsable(checks)).toBe(true);
  });
});
