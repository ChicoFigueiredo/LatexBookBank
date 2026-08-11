import { describe, expect, it } from "vitest";

import { optionLabelAt } from "@modules/questions/domain/question-type";
import {
  keyForMove,
  keyForNewOption,
  OptionNotFoundError,
  patchesForCorrect,
  shuffledForDisplay,
  sortOptions,
  type OptionRecord,
} from "@modules/questions/domain/option-mutations";

const option = (id: string, sortKey: string, isCorrect = false): OptionRecord => ({
  id,
  sortKey,
  statementLatex: id,
  solutionLatex: "",
  isCorrect,
});

/** Quatro alternativas, a "c" correta. */
const base = (): OptionRecord[] => [
  option("a", "a0"),
  option("b", "a1"),
  option("c", "a2", true),
  option("d", "a3"),
];

const ids = (options: readonly OptionRecord[]): string[] => options.map((o) => o.id);

/** Aplica patches, como o repositório faria. */
function apply(
  options: readonly OptionRecord[],
  patches: readonly { id: string; isCorrect?: boolean; sortKey?: string }[],
): OptionRecord[] {
  return options.map((current) => {
    const patch = patches.find((p) => p.id === current.id);
    if (patch === undefined) return current;
    return {
      ...current,
      ...(patch.isCorrect === undefined ? {} : { isCorrect: patch.isCorrect }),
      ...(patch.sortKey === undefined ? {} : { sortKey: patch.sortKey }),
    };
  });
}

describe("keyForNewOption", () => {
  it("põe a nova no fim", () => {
    // Quem acrescenta está continuando a lista; inserir no topo empurraria todo mundo para baixo
    // por um gesto que não pedia isso.
    const key = keyForNewOption(base());
    const sorted = sortOptions([...base(), option("nova", key)]);

    expect(ids(sorted).at(-1)).toBe("nova");
  });

  it("funciona com a lista vazia", () => {
    expect(keyForNewOption([])).toBeTruthy();
  });
});

describe("keyForMove", () => {
  it("move para o topo", () => {
    const options = base();
    const key = keyForMove(options, "c", 0);
    const sorted = sortOptions(apply(options, [{ id: "c", sortKey: key }]));

    expect(ids(sorted)).toEqual(["c", "a", "b", "d"]);
  });

  it("move para o fim", () => {
    const options = base();
    const key = keyForMove(options, "a", 3);
    const sorted = sortOptions(apply(options, [{ id: "a", sortKey: key }]));

    expect(ids(sorted)).toEqual(["b", "c", "d", "a"]);
  });

  it("move para o meio", () => {
    const options = base();
    const key = keyForMove(options, "d", 1);
    const sorted = sortOptions(apply(options, [{ id: "d", sortKey: key }]));

    expect(ids(sorted)).toEqual(["a", "d", "b", "c"]);
  });

  it("tira a própria alternativa antes de calcular os vizinhos", () => {
    // Sem isso, mover para a posição seguinte à própria calcularia "entre ela mesma e o vizinho"
    // e devolveria uma chave que não muda nada.
    const options = base();
    const key = keyForMove(options, "b", 2);
    const sorted = sortOptions(apply(options, [{ id: "b", sortKey: key }]));

    expect(ids(sorted)).toEqual(["a", "c", "b", "d"]);
  });

  it("índice fora da faixa não quebra", () => {
    const options = base();
    expect(() => keyForMove(options, "a", 99)).not.toThrow();
    expect(() => keyForMove(options, "a", -5)).not.toThrow();
  });

  it("recusa alternativa que não existe", () => {
    expect(() => keyForMove(base(), "inexistente", 0)).toThrow(OptionNotFoundError);
  });

  it("**o gabarito sobrevive a mover** — não só a embaralhar", () => {
    // A spec cita o embaralhamento, mas mover é a operação que a pessoa faz o dia todo.
    let options = base();
    for (const [id, index] of [
      ["c", 0],
      ["a", 3],
      ["d", 1],
      ["c", 2],
    ] as const) {
      options = apply(options, [{ id, sortKey: keyForMove(options, id, index) }]);
      const correct = sortOptions(options).filter((o) => o.isCorrect);

      expect(correct).toHaveLength(1);
      expect(correct[0]?.id).toBe("c");
    }
  });
});

describe("patchesForCorrect", () => {
  it("em múltipla escolha, marcar uma desmarca a outra", () => {
    // O tipo diz "escolha uma"; deixar duas produziria gabarito ambíguo que só apareceria na
    // validação, depois.
    const options = base();
    const patches = patchesForCorrect(options, "a", true);
    const applied = apply(options, patches);

    expect(applied.filter((o) => o.isCorrect).map((o) => o.id)).toEqual(["a"]);
  });

  it("clicar de novo na correta não faz nada", () => {
    // Comportamento de rádio. Desmarcar deixaria a questão sem gabarito, que é erro de validação.
    expect(patchesForCorrect(base(), "c", true)).toEqual([]);
  });

  it("toca **apenas** as alternativas que mudam", () => {
    // Mandar as cinco de volta faria uma escrita de cinco linhas onde bastava uma.
    const patches = patchesForCorrect(base(), "a", true);
    expect(patches.map((p) => p.id).sort()).toEqual(["a", "c"]);
  });

  it("em múltiplas corretas, marcar é alternar e não mexe nas outras", () => {
    const options = base();
    const applied = apply(options, patchesForCorrect(options, "a", false));

    expect(
      applied
        .filter((o) => o.isCorrect)
        .map((o) => o.id)
        .sort(),
    ).toEqual(["a", "c"]);
  });

  it("recusa alternativa que não existe", () => {
    expect(() => patchesForCorrect(base(), "zzz", true)).toThrow(OptionNotFoundError);
  });
});

describe("shuffledForDisplay", () => {
  it("**não** devolve patches — embaralhar é o que se vê, não o que se grava", () => {
    // O legado embaralhava gravando, e era isso que fazia o gabarito seguir a letra.
    const options = base();
    const shuffled = shuffledForDisplay(options, () => 0.42);

    expect(shuffled.map((o) => o.sortKey).sort()).toEqual(options.map((o) => o.sortKey).sort());
  });

  it("o gabarito acompanha a alternativa, não a posição", () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      let state = seed;
      const random = () => {
        state = (state * 1103515245 + 12345) % 2147483648;
        return state / 2147483648;
      };
      const shuffled = shuffledForDisplay(base(), random);
      const correctIndex = shuffled.findIndex((o) => o.isCorrect);

      expect(shuffled[correctIndex]?.id).toBe("c");
      // E a letra mostrada é a da nova posição — projeção, nunca identidade (D9).
      expect(optionLabelAt(correctIndex)).toBe(optionLabelAt(correctIndex));
    }
  });

  it("não perde nem duplica alternativa", () => {
    const shuffled = shuffledForDisplay(base(), () => 0.7);
    expect(ids(shuffled).sort()).toEqual(["a", "b", "c", "d"]);
  });
});
