import { describe, expect, it } from "vitest";

import {
  addOption,
  isExclusiveCorrect,
  moveOption,
  QuestionNotFoundError,
  removeOption,
  setCorrectOption,
  type OptionWriter,
} from "@modules/questions/application/mutate-options";
import {
  OptionNotFoundError,
  sortOptions,
  type OptionRecord,
} from "@modules/questions/domain/option-mutations";
import { QUESTION_TYPES, type QuestionType } from "@modules/questions/domain/question-type";

/** Um banco em memória com o comportamento que importa: transação e ordem. */
class FakeWriter implements OptionWriter {
  transactions = 0;
  private options: OptionRecord[];

  constructor(
    options: OptionRecord[],
    private readonly type: QuestionType | null = "MULTIPLE_CHOICE",
  ) {
    this.options = options;
  }

  async listOptions(): Promise<readonly OptionRecord[]> {
    return sortOptions(this.options);
  }

  async questionType(): Promise<QuestionType | null> {
    return this.type;
  }

  async insertOption(_q: string, option: Omit<OptionRecord, "id">): Promise<OptionRecord> {
    const record = { ...option, id: `new-${this.options.length}` };
    this.options.push(record);
    return record;
  }

  async deleteOption(_q: string, optionId: string): Promise<void> {
    this.options = this.options.filter((option) => option.id !== optionId);
  }

  async applyPatches(
    _q: string,
    patches: readonly { id: string; sortKey?: string; isCorrect?: boolean }[],
  ): Promise<void> {
    this.transactions += 1;
    this.options = this.options.map((option) => {
      const patch = patches.find((p) => p.id === option.id);
      if (patch === undefined) return option;
      return {
        ...option,
        ...(patch.sortKey === undefined ? {} : { sortKey: patch.sortKey }),
        ...(patch.isCorrect === undefined ? {} : { isCorrect: patch.isCorrect }),
      };
    });
  }

  get current(): OptionRecord[] {
    return sortOptions(this.options);
  }
}

const option = (id: string, sortKey: string, isCorrect = false): OptionRecord => ({
  id,
  sortKey,
  statementLatex: id,
  solutionLatex: "",
  isCorrect,
});

const base = (): OptionRecord[] => [option("a", "a0"), option("b", "a1"), option("c", "a2", true)];

describe("isExclusiveCorrect", () => {
  it("cobre **todos** os tipos do vocabulário", () => {
    // Tabela e não `switch`: acrescentar um tipo é acrescentar uma linha. Se um tipo novo entrar
    // no vocabulário sem entrar na tabela, é aqui que aparece.
    for (const type of QUESTION_TYPES) {
      expect(typeof isExclusiveCorrect(type)).toBe("boolean");
    }
  });

  it("múltipla escolha é exclusiva; múltiplas corretas não", () => {
    expect(isExclusiveCorrect("MULTIPLE_CHOICE")).toBe(true);
    expect(isExclusiveCorrect("MULTIPLE_CORRECT")).toBe(false);
  });
});

describe("addOption", () => {
  it("acrescenta no fim", async () => {
    const writer = new FakeWriter(base());
    await addOption(writer, "q", "nova");

    expect(writer.current.at(-1)?.statementLatex).toBe("nova");
  });

  it("**nunca** nasce marcada como correta", async () => {
    // Uma alternativa em branco marcada como gabarito passa despercebida até alguém imprimir.
    const writer = new FakeWriter(base());
    const created = await addOption(writer, "q");

    expect(created.isCorrect).toBe(false);
    expect(writer.current.filter((o) => o.isCorrect)).toHaveLength(1);
  });
});

describe("removeOption", () => {
  it("remove", async () => {
    const writer = new FakeWriter(base());
    await removeOption(writer, "q", "b");

    expect(writer.current.map((o) => o.id)).toEqual(["a", "c"]);
  });

  it("**permite** remover a única correta", async () => {
    // Quem reescreve a questão precisa poder tirar a alternativa antes de pôr a nova. Recusar
    // aqui transformaria uma edição normal numa dança de ordem obrigatória — quem acusa a questão
    // sem gabarito é a validação.
    const writer = new FakeWriter(base());
    await removeOption(writer, "q", "c");

    expect(writer.current.filter((o) => o.isCorrect)).toHaveLength(0);
  });

  it("recusa alternativa que não existe", async () => {
    await expect(removeOption(new FakeWriter(base()), "q", "zzz")).rejects.toBeInstanceOf(
      OptionNotFoundError,
    );
  });
});

describe("moveOption", () => {
  it("reordena e o gabarito acompanha", async () => {
    const writer = new FakeWriter(base());
    await moveOption(writer, "q", "c", 0);

    expect(writer.current.map((o) => o.id)).toEqual(["c", "a", "b"]);
    expect(writer.current.filter((o) => o.isCorrect).map((o) => o.id)).toEqual(["c"]);
  });

  it("grava só a alternativa movida", async () => {
    // Fractional index existe para isto: reordenar não reescreve os irmãos.
    const writer = new FakeWriter(base());
    await moveOption(writer, "q", "a", 2);

    expect(writer.transactions).toBe(1);
  });
});

describe("setCorrectOption", () => {
  it("em múltipla escolha, desmarca a anterior", async () => {
    const writer = new FakeWriter(base());
    await setCorrectOption(writer, "q", "a");

    expect(writer.current.filter((o) => o.isCorrect).map((o) => o.id)).toEqual(["a"]);
  });

  it("clicar de novo na correta **não chama o banco**", async () => {
    // Uma transação para não mudar coisa alguma.
    const writer = new FakeWriter(base());
    await setCorrectOption(writer, "q", "c");

    expect(writer.transactions).toBe(0);
  });

  it("em múltiplas corretas, acumula", async () => {
    const writer = new FakeWriter(base(), "MULTIPLE_CORRECT");
    await setCorrectOption(writer, "q", "a");

    expect(
      writer.current
        .filter((o) => o.isCorrect)
        .map((o) => o.id)
        .sort(),
    ).toEqual(["a", "c"]);
  });

  it("questão inexistente é erro próprio, não `null` silencioso", async () => {
    const writer = new FakeWriter(base(), null);
    await expect(setCorrectOption(writer, "q", "a")).rejects.toBeInstanceOf(QuestionNotFoundError);
  });
});

describe("o gabarito sobrevive a uma sessão de edição inteira", () => {
  it("mover, acrescentar, remover e marcar", async () => {
    // O teste da spec cita o embaralhamento; o dia a dia é isto.
    const writer = new FakeWriter(base());

    await moveOption(writer, "q", "c", 0);
    await addOption(writer, "q", "nova");
    await removeOption(writer, "q", "b");
    await moveOption(writer, "q", "a", 2);

    const correct = writer.current.filter((o) => o.isCorrect);
    expect(correct).toHaveLength(1);
    expect(correct[0]?.id).toBe("c");

    await setCorrectOption(writer, "q", "a");
    const depois = writer.current.filter((o) => o.isCorrect);
    expect(depois.map((o) => o.id)).toEqual(["a"]);
  });
});
