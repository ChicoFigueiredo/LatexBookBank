import { describe, expect, it } from "vitest";

import "@modules/questions/domain/plugins";
import {
  tagQuestion,
  tagQuestionMany,
  untagQuestion,
  type TagRecord,
  type TagRepository,
} from "@modules/questions/application/tag-question";
import {
  evaluateQuestion,
  validateAndPersist,
  type ValidationWriter,
} from "@modules/questions/application/validate-question";
import { parseTagInput, type TagSuggestion } from "@modules/questions/domain/tag";
import type { QuestionForPlugin } from "@modules/questions/domain/question-type-plugin";
import type { ValidationStatus } from "@modules/questions/domain/question-type";

class FakeTags implements TagRepository {
  created: string[] = [];
  attached: [string, string][] = [];
  detached: [string, string][] = [];
  private tags: TagSuggestion[];

  constructor(tags: TagSuggestion[] = []) {
    this.tags = tags;
  }

  async listTags(): Promise<readonly TagSuggestion[]> {
    return this.tags;
  }

  async createTag(_workspaceId: string, name: string): Promise<TagRecord> {
    this.created.push(name);
    const tag = { id: `t${this.tags.length + 1}`, name, usageCount: 0 };
    this.tags.push(tag);
    return { id: tag.id, name: tag.name };
  }

  async attach(questionId: string, tagId: string): Promise<void> {
    this.attached.push([questionId, tagId]);
  }

  async detach(questionId: string, tagId: string): Promise<void> {
    this.detached.push([questionId, tagId]);
  }

  async listQuestionTags(): Promise<readonly TagRecord[]> {
    return [];
  }
}

describe("tagQuestion", () => {
  it("reaproveita a tag existente, mesmo com outra grafia", async () => {
    // Sem isso, o filtro por tag começa a mentir depois do primeiro mês de uso.
    const repository = new FakeTags([{ id: "t1", name: "Função Quadrática", usageCount: 5 }]);
    const applied = await tagQuestion(repository, "w", "q", "funcao quadratica");

    expect(applied.id).toBe("t1");
    expect(repository.created).toEqual([]);
  });

  it("cria quando não existe, preservando a grafia digitada", async () => {
    const repository = new FakeTags();
    const applied = await tagQuestion(repository, "w", "q", "  Álgebra  Linear ");

    expect(applied.name).toBe("Álgebra Linear");
    expect(repository.created).toEqual(["Álgebra Linear"]);
  });

  it("aplica a tag à questão", async () => {
    const repository = new FakeTags();
    await tagQuestion(repository, "w", "q1", "álgebra");

    expect(repository.attached).toEqual([["q1", "t1"]]);
  });
});

describe("tagQuestionMany", () => {
  it("**sequencial**: duas grafias da mesma tag numa colagem criam uma linha só", async () => {
    // Em paralelo, as duas resolveriam "não existe" ao mesmo tempo e criariam duas.
    const repository = new FakeTags();
    await tagQuestionMany(repository, "w", "q", ["Função", "funcao"]);

    expect(repository.created).toEqual(["Função"]);
    expect(repository.attached).toHaveLength(2);
  });

  it("colar uma lista funciona ponta a ponta", async () => {
    const repository = new FakeTags();
    const applied = await tagQuestionMany(
      repository,
      "w",
      "q",
      parseTagInput("álgebra, funções ,  Álgebra "),
    );

    expect(applied.map((t) => t.name)).toEqual(["álgebra", "funções"]);
  });
});

describe("untagQuestion", () => {
  it("não checa antes — desmarcar o que já está desmarcado dá no mesmo", async () => {
    // Exigir a leitura antes acrescentaria uma ida ao banco para às vezes recusar um clique
    // duplo, que é o gesto e não o erro.
    const repository = new FakeTags();
    await untagQuestion(repository, "q", "t1");

    expect(repository.detached).toEqual([["q", "t1"]]);
  });
});

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

describe("evaluateQuestion", () => {
  it("questão boa fica `VALID`", () => {
    expect(evaluateQuestion(question()).status).toBe("VALID");
  });

  it("erro deixa `INVALID`", () => {
    expect(evaluateQuestion(question({ statementLatex: "" })).status).toBe("INVALID");
  });

  it("**aviso não invalida**", () => {
    // O acervo tem centenas de questões sem resolução escrita. Marcá-las inválidas faria a lista
    // de problemas virar ruído que ninguém abre.
    const outcome = evaluateQuestion(question({ solutionLatex: "" }));

    expect(outcome.status).toBe("VALID");
    expect(outcome.issues.some((i) => i.severity === "warning")).toBe(true);
  });

  it("tipo sem plugin fica `UNVALIDATED`, não `INVALID`", () => {
    // Dizer que ela está errada seria mentira: o que falta é o produto saber avaliá-la.
    const outcome = evaluateQuestion(question({ type: "CESPE" }));

    expect(outcome.status).toBe("UNVALIDATED");
    expect(outcome.unsupported).toBe(true);
  });
});

describe("validateAndPersist", () => {
  it("grava o estado que avaliou", async () => {
    const gravados: ValidationStatus[] = [];
    const writer: ValidationWriter = {
      async setValidationStatus(_id, status) {
        gravados.push(status);
      },
    };

    await validateAndPersist(writer, "q", question({ statementLatex: "" }));
    expect(gravados).toEqual(["INVALID"]);
  });
});
