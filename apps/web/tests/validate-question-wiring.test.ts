import { describe, expect, it } from "vitest";

// **Nenhum import do registro aqui.** É o ponto do arquivo.
import {
  evaluateQuestion,
  validateAndPersist,
  type ValidationWriter,
} from "@modules/questions/application/validate-question";
import type { ValidationStatus } from "@modules/questions/domain/question-type";
import type { QuestionForPlugin } from "@modules/questions/domain/question-type-plugin";

/**
 * A validação funciona por **quem a chama de verdade**, não por quem a testa.
 *
 * `question-type-plugin.test.ts` sempre passou — e importa
 * `@modules/questions/domain/plugins` na primeira linha. Quer dizer: o teste carregava o
 * registro, a produção não, e `pluginFor` devolvia `null` para tudo. As 16 questões do banco
 * ficaram `UNVALIDATED` desde a Fase 7, e a tool `validate_question` do agente respondia "tipo
 * não suportado" para o acervo inteiro — em silêncio, porque `null` é resposta legítima.
 *
 * Este arquivo importa **só o caso de uso**, como a rota faz. Se o import de efeito colateral
 * sair de `validate-question.ts`, é aqui que se descobre — e não seis fases depois.
 *
 * Ver issue #147.
 */

const multipleChoice = (over: Partial<QuestionForPlugin> = {}): QuestionForPlugin => ({
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

describe("o registro de plugins está carregado no caminho de produção", () => {
  it("múltipla escolha **não** cai em `unsupported`", () => {
    const outcome = evaluateQuestion(multipleChoice());

    expect(outcome.unsupported).toBe(false);
    expect(outcome.status).toBe("VALID");
  });

  it("discursiva também", () => {
    const outcome = evaluateQuestion({
      type: "DISCURSIVE",
      statementLatex: "Demonstre que o montante cresce linearmente.",
      solutionLatex: "Por definição, $M = C(1+in)$.",
      complementLatex: "",
      options: [],
    });

    expect(outcome.unsupported).toBe(false);
  });

  it("questão sem gabarito vira `INVALID` — é o que acende o indicador da árvore", () => {
    const outcome = evaluateQuestion({
      ...multipleChoice(),
      options: [
        { id: "o1", statementLatex: "3", isCorrect: false },
        { id: "o2", statementLatex: "4", isCorrect: false },
      ],
    });

    expect(outcome.status).toBe("INVALID");
    expect(outcome.issues.some((issue) => issue.severity === "error")).toBe(true);
  });

  it("aviso não invalida", () => {
    // Senão a lista de problemas vira ruído que ninguém abre — e o indicador junto.
    const outcome = evaluateQuestion({ ...multipleChoice(), solutionLatex: "" });

    if (outcome.issues.some((issue) => issue.severity === "warning")) {
      expect(outcome.status).not.toBe("INVALID");
    }
  });
});

/**
 * **A validação não pode se passar por uma edição** (#166).
 *
 * Ela grava depois do salvamento, na mesma questão, e `updatedAt` é o token de concorrência. Sem
 * preservar a versão, a gravação do veredito avançava o relógio **depois** de o `PATCH` já ter
 * respondido — e o salvamento seguinte batia em 409. Na tela: digite, espere salvar, continue
 * digitando, e a barra diz "conflito · o autosave está pausado".
 *
 * Foi o E2E que achou, e foi preciso duas voltas para acreditar: parecia teste frágil.
 */
describe("a validação preserva a versão da questão", () => {
  class WriterEspiao implements ValidationWriter {
    readonly calls: { status: ValidationStatus; keepVersion?: Date }[] = [];

    async setValidationStatus(
      _questionId: string,
      status: ValidationStatus,
      keepVersion?: Date,
    ): Promise<void> {
      this.calls.push(keepVersion === undefined ? { status } : { status, keepVersion });
    }
  }

  it("a versão do salvamento chega ao adaptador — é ela que o mantém parado", async () => {
    const writer = new WriterEspiao();
    const versao = new Date("2026-08-11T02:00:00.000Z");

    await validateAndPersist(writer, "q1", multipleChoice(), versao);

    expect(writer.calls).toEqual([{ status: "VALID", keepVersion: versao }]);
  });

  it("sem versão, grava assim mesmo — o veredito vale mais que o relógio", async () => {
    // O import e a tool do agente também validam, e nesses caminhos não existe um salvamento cuja
    // versão preservar. Exigir o parâmetro faria a validação depender de um contexto que nem
    // sempre existe, e o resultado seria não validar.
    const writer = new WriterEspiao();

    await validateAndPersist(writer, "q1", multipleChoice());

    expect(writer.calls).toEqual([{ status: "VALID" }]);
  });
});
