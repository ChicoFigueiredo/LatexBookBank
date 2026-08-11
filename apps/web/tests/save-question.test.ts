import { beforeEach, describe, expect, it } from "vitest";

import { QuestionNotFoundError, saveQuestion } from "@modules/questions/application/save-question";
import type {
  QuestionEdit,
  QuestionRepository,
  QuestionSnapshot,
} from "@modules/questions/domain/question-repository";
import { ConcurrencyConflictError } from "@/shared/ports/repository";

/**
 * A regra inviolável da spec §42: **conflito nunca sobrescreve em silêncio**.
 *
 * Vale mais aqui do que em qualquer outro salvamento porque o autosave da Fase 3 dispara sozinho.
 * Uma sobrescrita aceita por engano acontece sem gesto do usuário e sem aviso — ele descobre
 * quando o texto do outro sumiu.
 */

const T0 = new Date("2026-08-07T19:00:00.000Z");
const T1 = new Date("2026-08-07T19:05:00.000Z");

class InMemoryQuestions implements QuestionRepository {
  writes = 0;

  constructor(private snapshot: QuestionSnapshot | null) {}

  /** Simula outro processo mexendo na linha entre a leitura e a escrita. */
  mutateBehindOurBack(updatedAt: Date): void {
    if (this.snapshot) this.snapshot = { ...this.snapshot, updatedAt };
  }

  async findById(): Promise<QuestionSnapshot | null> {
    return this.snapshot;
  }

  async updateIfUnchanged(
    _questionId: string,
    expectedUpdatedAt: Date,
    edit: QuestionEdit,
  ): Promise<QuestionSnapshot | null> {
    if (!this.snapshot) return null;
    if (this.snapshot.updatedAt.getTime() !== expectedUpdatedAt.getTime()) return null;

    this.writes += 1;
    this.snapshot = {
      ...this.snapshot,
      ...Object.fromEntries(Object.entries(edit).filter(([, v]) => v !== undefined)),
      updatedAt: new Date(expectedUpdatedAt.getTime() + 1000),
    };
    return this.snapshot;
  }
}

const base: QuestionSnapshot = {
  id: "q-1",
  statementLatex: "Calcule $2+2$.",
  solutionLatex: "$4$",
  complementLatex: "",
  nickname: null,
  difficulty: 5,
  year: null,
  board: null,
  institution: null,
  role: null,
  roleLevel: null,
  publisher: null,
  videoUrl: null,
  updatedAt: T0,
};

let repository: InMemoryQuestions;

beforeEach(() => {
  repository = new InMemoryQuestions({ ...base });
});

describe("salvamento normal", () => {
  it("grava e devolve o snapshot novo", async () => {
    const result = await saveQuestion(repository, {
      questionId: "q-1",
      expectedUpdatedAt: T0,
      edit: { statementLatex: "Calcule $3+3$." },
    });

    expect(result.written).toBe(true);
    expect(result.snapshot.statementLatex).toBe("Calcule $3+3$.");
    expect(result.snapshot.updatedAt.getTime()).toBeGreaterThan(T0.getTime());
  });

  it("campo ausente na edição não é apagado", async () => {
    const result = await saveQuestion(repository, {
      questionId: "q-1",
      expectedUpdatedAt: T0,
      edit: { complementLatex: "Ver capítulo 2." },
    });

    expect(result.snapshot.statementLatex).toBe(base.statementLatex);
    expect(result.snapshot.solutionLatex).toBe(base.solutionLatex);
  });

  it("recusa questão inexistente em vez de criar uma", async () => {
    const empty = new InMemoryQuestions(null);
    await expect(
      saveQuestion(empty, { questionId: "some", expectedUpdatedAt: T0, edit: {} }),
    ).rejects.toThrow(QuestionNotFoundError);
  });
});

describe("conflito nunca sobrescreve em silêncio", () => {
  it("recusa quando a linha mudou desde a leitura, sem gravar nada", async () => {
    repository.mutateBehindOurBack(T1);

    await expect(
      saveQuestion(repository, {
        questionId: "q-1",
        expectedUpdatedAt: T0,
        edit: { statementLatex: "sobrescrita" },
      }),
    ).rejects.toThrow(ConcurrencyConflictError);

    expect(repository.writes).toBe(0);
  });

  it("o erro carrega os dois lados — o cliente precisa poder mostrar o quê contra o quê", async () => {
    repository.mutateBehindOurBack(T1);

    const error = await saveQuestion(repository, {
      questionId: "q-1",
      expectedUpdatedAt: T0,
      edit: { statementLatex: "x" },
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConcurrencyConflictError);
    const conflict = error as ConcurrencyConflictError;
    expect(conflict.expectedVersion).toBe(T0.toISOString());
    expect(conflict.actualVersion).toBe(T1.toISOString());
  });

  it("duas edições concorrentes: a primeira grava, a segunda é recusada", async () => {
    const first = await saveQuestion(repository, {
      questionId: "q-1",
      expectedUpdatedAt: T0,
      edit: { statementLatex: "versão da aba A" },
    });
    expect(first.written).toBe(true);

    // A aba B leu antes de A gravar, e ainda carrega T0.
    await expect(
      saveQuestion(repository, {
        questionId: "q-1",
        expectedUpdatedAt: T0,
        edit: { statementLatex: "versão da aba B" },
      }),
    ).rejects.toThrow(ConcurrencyConflictError);

    const survivor = await repository.findById();
    expect(survivor?.statementLatex).toBe("versão da aba A");
  });

  /**
   * A ordem entre "conflito" e "nada mudou" importa. Se o atalho viesse primeiro, um autosave sem
   * alterações passaria batido sobre uma linha já modificada, e o cliente continuaria achando que
   * tem a versão corrente — até a edição seguinte sobrescrever de verdade.
   */
  it("autosave sem alterações também detecta conflito", async () => {
    repository.mutateBehindOurBack(T1);

    await expect(
      saveQuestion(repository, {
        questionId: "q-1",
        expectedUpdatedAt: T0,
        edit: { statementLatex: base.statementLatex },
      }),
    ).rejects.toThrow(ConcurrencyConflictError);
  });
});

describe("autosave sem alterações", () => {
  it("não bate no banco quando nada mudou", async () => {
    const result = await saveQuestion(repository, {
      questionId: "q-1",
      expectedUpdatedAt: T0,
      edit: { statementLatex: base.statementLatex, solutionLatex: base.solutionLatex },
    });

    expect(result.written).toBe(false);
    expect(repository.writes).toBe(0);
    expect(result.snapshot.updatedAt).toEqual(T0);
  });

  it("edição vazia também não grava", async () => {
    const result = await saveQuestion(repository, {
      questionId: "q-1",
      expectedUpdatedAt: T0,
      edit: {},
    });

    expect(result.written).toBe(false);
    expect(repository.writes).toBe(0);
  });

  /**
   * Sem esta guarda, cada pausa na digitação empurraria `updatedAt` para frente e invalidaria a
   * versão que as outras abas têm em mãos — fabricando conflito onde não houve edição nenhuma.
   */
  it("dez autosaves sem edição não movem o `updatedAt`", async () => {
    for (let i = 0; i < 10; i++) {
      await saveQuestion(repository, {
        questionId: "q-1",
        expectedUpdatedAt: T0,
        edit: { statementLatex: base.statementLatex },
      });
    }

    expect(repository.writes).toBe(0);
    expect((await repository.findById())?.updatedAt).toEqual(T0);
  });
});

describe("a corrida entre ler e gravar", () => {
  /**
   * A comparação real acontece na cláusula do UPDATE. Este teste força o cenário em que a linha
   * muda **depois** da leitura de conflito e **antes** da escrita — a janela que a verificação em
   * código sozinha não fecharia.
   */
  it("o UPDATE condicional recusa mesmo passando pela verificação anterior", async () => {
    class RacingRepository extends InMemoryQuestions {
      override async updateIfUnchanged(): Promise<QuestionSnapshot | null> {
        return null; // outro processo gravou primeiro
      }
    }
    const racing = new RacingRepository({ ...base });

    await expect(
      saveQuestion(racing, {
        questionId: "q-1",
        expectedUpdatedAt: T0,
        edit: { statementLatex: "mudou" },
      }),
    ).rejects.toThrow(ConcurrencyConflictError);
  });
});
