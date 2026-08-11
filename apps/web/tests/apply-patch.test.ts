import { describe, expect, it, vi } from "vitest";

import {
  applyQuestionPatch,
  QuestionGoneError,
  revertQuestion,
  type PatchApplier,
  type PatchTransaction,
} from "@modules/agents/application/apply-question-patch";
import { NothingApprovedError, planApply, snapshotOf } from "@modules/agents/domain/apply-patch";
import type { QuestionState } from "@modules/agents/domain/patch-diff";
import { PATCH_SCHEMA_VERSION, parseQuestionPatch } from "@modules/agents/domain/question-patch";

/**
 * **Nada é aplicado sem aprovação explícita.**
 *
 * Até a Fase 8 isso valia por ausência — não havia caminho de escrita nenhum. Aqui existe um, e é
 * este arquivo que prova que ele exige a lista de aprovadas.
 */

const state = (over: Partial<QuestionState> = {}): QuestionState => ({
  statementLatex: "Qual é a taxa?",
  solutionLatex: "",
  complementLatex: "",
  nickname: null,
  options: [
    { id: "o-1", statementLatex: "1\\%", isCorrect: false },
    { id: "o-2", statementLatex: "2\\%", isCorrect: true },
  ],
  metadata: { board: "CESPE", year: 2024 },
  tags: ["juros"],
  ...over,
});

const patch = (over: Record<string, unknown>) =>
  parseQuestionPatch({ schemaVersion: PATCH_SCHEMA_VERSION, summary: "Corrige.", ...over });

const fullPatch = patch({
  fields: [
    { field: "statementLatex", value: "Qual é a taxa à vista?" },
    { field: "solutionLatex", value: "Resolução nova" },
  ],
  options: [{ optionId: "o-1", statementLatex: "1,5\\%" }],
  metadata: { board: "CEBRASPE" },
});

describe("o plano só contém o aprovado", () => {
  it("aprovar uma linha não arrasta as outras", () => {
    const plan = planApply(state(), fullPatch, ["field:statementLatex"]);

    expect(Object.keys(plan.fields)).toEqual(["statementLatex"]);
    expect(plan.options).toEqual([]);
    expect(plan.metadata).toEqual({});
  });

  it("aprovar tudo aplica tudo", () => {
    const plan = planApply(state(), fullPatch, [
      "field:statementLatex",
      "field:solutionLatex",
      "option:o-1:text",
      "metadata:board",
    ]);

    expect(Object.keys(plan.fields).sort()).toEqual(["solutionLatex", "statementLatex"]);
    expect(plan.options).toEqual([{ id: "o-1", statementLatex: "1,5\\%" }]);
    expect(plan.metadata).toEqual({ board: "CEBRASPE" });
  });

  it("lista vazia de aprovadas **recusa** — não vira aplicar tudo", () => {
    // O modo de falha que a regra existe para impedir.
    expect(() => planApply(state(), fullPatch, [])).toThrow(NothingApprovedError);
  });

  it("aprovar um id que não está no diff não aplica nada", () => {
    expect(() => planApply(state(), fullPatch, ["field:inventado"])).toThrow(NothingApprovedError);
  });

  it("texto e gabarito da mesma alternativa são aprovações separadas", () => {
    const both = patch({
      options: [{ optionId: "o-1", statementLatex: "1,5\\%", isCorrect: true }],
    });

    const onlyText = planApply(state(), both, ["option:o-1:text"]);
    expect(onlyText.options).toEqual([{ id: "o-1", statementLatex: "1,5\\%" }]);

    const onlyMark = planApply(state(), both, ["option:o-1:correct"]);
    expect(onlyMark.options).toEqual([{ id: "o-1", isCorrect: true }]);
  });

  it("`nickname` esvaziado vira `null`, não string vazia", () => {
    // A coluna é anulável; `""` seria um apelido em branco em vez de nenhum apelido.
    const plan = planApply(
      state({ nickname: "antigo" }),
      patch({ fields: [{ field: "nickname", value: "  " }] }),
      ["field:nickname"],
    );

    expect(plan.fields["nickname"]).toBeNull();
  });

  it("linha aprovada que sumiu do diff é reportada como obsoleta", () => {
    // O estado mudou entre a proposta e o clique — outra aba, o autosave. Gravar assim mesmo
    // passaria por cima de trabalho que ninguém pediu para desfazer.
    const changed = state({ statementLatex: "Qual é a taxa à vista?" });
    const plan = planApply(changed, fullPatch, ["field:statementLatex", "metadata:board"]);

    expect(plan.stale).toEqual(["field:statementLatex"]);
    expect(Object.keys(plan.fields)).toEqual([]);
  });
});

/** Transação de mentira que registra a ordem exata das operações. */
function fakeApplier(initial: QuestionState = state()) {
  const log: string[] = [];
  let current = initial;
  let revisions = 0;
  let failOn: string | null = null;

  const tx: PatchTransaction = {
    readStateForUpdate: (id) => {
      log.push(`read:${id}`);
      return Promise.resolve(current as QuestionState | null);
    },
    writeRevision: (input) => {
      log.push(`revision:${input.origin}:${input.snapshotJson.length}b`);
      revisions += 1;
      return Promise.resolve(revisions);
    },
    applyFields: (_id, fields) => {
      log.push(`fields:${Object.keys(fields).join(",")}`);
      if (failOn === "fields") return Promise.reject(new Error("banco caiu"));
      return Promise.resolve();
    },
    applyOptions: (_id, options) => {
      log.push(`options:${options.map((o) => o.id).join(",")}`);
      return Promise.resolve();
    },
    applyReorder: (_id, ids) => {
      log.push(`reorder:${ids.join(",")}`);
      return Promise.resolve();
    },
    applyMetadata: (_id, metadata) => {
      log.push(`metadata:${Object.keys(metadata).join(",")}`);
      return Promise.resolve();
    },
    applyTags: (_id, names) => {
      log.push(`tags:${names.join(",")}`);
      return Promise.resolve();
    },
  };

  const applier: PatchApplier = {
    transact: async (run) => {
      log.push("begin");
      try {
        const result = await run(tx);
        log.push("commit");
        return result;
      } catch (error) {
        log.push("rollback");
        throw error;
      }
    },
  };

  return {
    applier,
    log,
    setState: (next: QuestionState | null) => {
      current = next as QuestionState;
    },
    failOn: (step: string) => {
      failOn = step;
    },
  };
}

describe("a revisão vem antes da escrita, na mesma transação", () => {
  it("a ordem é: abrir, ler, gravar revisão, escrever, confirmar", async () => {
    // Fora de uma transação, uma falha entre os dois passos deixaria a mudança sem o seu "antes".
    const { applier, log } = fakeApplier();

    await applyQuestionPatch(applier, {
      questionId: "q-1",
      patch: fullPatch,
      approvedChangeIds: ["field:statementLatex"],
    });

    expect(log[0]).toBe("begin");
    expect(log[1]).toBe("read:q-1");
    expect(log[2]).toMatch(/^revision:AGENT/);
    expect(log[3]).toBe("fields:statementLatex");
    expect(log.at(-1)).toBe("commit");
  });

  it("falha ao escrever desfaz tudo — inclusive a revisão", async () => {
    const fake = fakeApplier();
    fake.failOn("fields");

    await expect(
      applyQuestionPatch(fake.applier, {
        questionId: "q-1",
        patch: fullPatch,
        approvedChangeIds: ["field:statementLatex"],
      }),
    ).rejects.toThrow("banco caiu");

    expect(fake.log.at(-1)).toBe("rollback");
  });

  it("nada aprovado não abre escrita nenhuma — nem revisão", async () => {
    const { applier, log } = fakeApplier();

    await expect(
      applyQuestionPatch(applier, {
        questionId: "q-1",
        patch: fullPatch,
        approvedChangeIds: [],
      }),
    ).rejects.toThrow(NothingApprovedError);

    expect(log.some((entry) => entry.startsWith("revision"))).toBe(false);
    expect(log.at(-1)).toBe("rollback");
  });

  it("questão que sumiu entre a proposta e o clique não é recriada", async () => {
    const fake = fakeApplier();
    fake.setState(null);

    await expect(
      applyQuestionPatch(fake.applier, {
        questionId: "q-1",
        patch: fullPatch,
        approvedChangeIds: ["field:statementLatex"],
      }),
    ).rejects.toThrow(QuestionGoneError);
  });

  it("o snapshot é o estado **inteiro**, não só o que mudou", async () => {
    // Uma revisão parcial não permite restaurar, que é a única coisa que ela existe para permitir.
    const write = vi.fn((_input: { snapshotJson: string }) => Promise.resolve(1));
    const fake = fakeApplier();
    const applier: PatchApplier = {
      transact: (run) =>
        fake.applier.transact((tx) => run({ ...tx, writeRevision: write as never })),
    };

    await applyQuestionPatch(applier, {
      questionId: "q-1",
      patch: fullPatch,
      approvedChangeIds: ["metadata:board"],
    });

    const snapshot = JSON.parse(write.mock.calls[0]?.[0].snapshotJson ?? "{}") as object;
    expect(Object.keys(snapshot).sort()).toEqual([
      "complementLatex",
      "metadata",
      "nickname",
      "options",
      "solutionLatex",
      "statementLatex",
      "tags",
    ]);
  });

  it("o resumo diz o que foi aplicado, e não o que foi proposto", async () => {
    const { applier } = fakeApplier();

    const result = await applyQuestionPatch(applier, {
      questionId: "q-1",
      patch: fullPatch,
      approvedChangeIds: ["field:statementLatex"],
    });

    expect(result.summary).toBe("Corrige. (Enunciado)");
    expect(result.applied).toEqual(["field:statementLatex"]);
  });
});

describe("reverter", () => {
  it("grava uma revisão do estado atual antes de restaurar", async () => {
    // Reverter é uma mudança como outra. Sem registro, não dá para desfazer o desfazer — que é
    // exatamente o que alguém quer quando reverteu por engano.
    const { applier, log } = fakeApplier();

    const number = await revertQuestion(applier, {
      questionId: "q-1",
      snapshotJson: snapshotOf(state({ statementLatex: "Versão antiga" })),
      summary: "Reverte para a revisão 3.",
    });

    expect(number).toBe(1);
    expect(log[2]).toMatch(/^revision:USER/);
    expect(log).toContain("fields:statementLatex,solutionLatex,complementLatex,nickname");
  });

  it("restaura também alternativas, ordem, metadados e tags", async () => {
    const { applier, log } = fakeApplier();

    await revertQuestion(applier, {
      questionId: "q-1",
      snapshotJson: snapshotOf(state()),
      summary: "Reverte.",
    });

    expect(log).toContain("options:o-1,o-2");
    expect(log).toContain("reorder:o-1,o-2");
    expect(log).toContain("tags:juros");
  });
});
