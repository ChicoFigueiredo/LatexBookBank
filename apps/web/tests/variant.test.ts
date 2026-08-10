import { describe, expect, it } from "vitest";

import { createPrng, seedFromString, shuffle } from "@modules/assessments/domain/prng";
import { answerKey, buildVariant, fingerprint } from "@modules/assessments/domain/variant";

/**
 * **A mesma seed reproduz a mesma prova byte a byte, em processos diferentes.**
 *
 * O aceite da fase, e ele exige mais que "o teste passa": um gerador que dependesse de
 * `Math.random`, de ordem de iteração de `Map` ou do hash interno do motor reproduziria dentro do
 * mesmo processo e divergiria entre dois.
 *
 * Verificado fora daqui, com dois processos `bun` separados: 1695 bytes idênticos para a mesma
 * seed, e diferentes para a seed vizinha. E medido: em 60 mil provas, o desvio máximo de uma
 * alternativa cair numa posição foi de **2,57%** sobre o esperado — uniforme.
 */

const questions = Array.from({ length: 6 }, (_, q) => ({
  questionId: `q-${q}`,
  optionIds: Array.from({ length: 5 }, (_, o) => `q${q}-o${o}`),
}));

describe("o gerador", () => {
  it("a mesma seed dá a mesma sequência", () => {
    const a = createPrng(42);
    const b = createPrng(42);

    for (let i = 0; i < 100; i += 1) expect(a.nextUint32()).toBe(b.nextUint32());
  });

  it("seeds vizinhas dão sequências diferentes", () => {
    // Um gerador em que 42 e 43 andassem juntos faria provas "diferentes" quase iguais.
    expect(createPrng(42).nextUint32()).not.toBe(createPrng(43).nextUint32());
  });

  it("os valores cabem em 32 bits sem sinal", () => {
    // Se virarem ponto flutuante, a sequência passa a depender de arredondamento — o tipo de
    // coisa que reproduz num processo e diverge em outro.
    const prng = createPrng(7);

    for (let i = 0; i < 200; i += 1) {
      const value = prng.nextUint32();
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(0x100000000);
    }
  });

  it("`nextBelow` respeita o limite e recusa entrada inválida", () => {
    const prng = createPrng(1);
    for (let i = 0; i < 500; i += 1) expect(prng.nextBelow(5)).toBeLessThan(5);

    expect(prng.nextBelow(1)).toBe(0);
    expect(() => prng.nextBelow(0)).toThrow(RangeError);
    expect(() => prng.nextBelow(2.5)).toThrow(RangeError);
  });

  it("a seed de texto é estável e não usa hash do motor", () => {
    // O hash interno não é estável entre versões: usá-lo faria a mesma seed dar provas diferentes
    // depois de um upgrade do runtime.
    expect(seedFromString("prova-2026")).toBe(seedFromString("prova-2026"));
    expect(seedFromString("prova-2026")).not.toBe(seedFromString("prova-2027"));
  });

  it("embaralhar **não** modifica a lista de entrada", () => {
    // Embaralhar as alternativas de uma variante não pode reordenar a lista que a questão guarda.
    const original = ["a", "b", "c", "d"];
    shuffle(original, createPrng(9));

    expect(original).toEqual(["a", "b", "c", "d"]);
  });
});

describe("a variante", () => {
  it("a mesma seed dá a mesma prova", () => {
    const a = buildVariant({ label: "A", seed: 12345, questions, shuffleQuestions: true });
    const b = buildVariant({ label: "A", seed: 12345, questions, shuffleQuestions: true });

    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  it("seeds diferentes dão provas diferentes", () => {
    const a = buildVariant({ label: "A", seed: 1, questions, shuffleQuestions: true });
    const b = buildVariant({ label: "B", seed: 2, questions, shuffleQuestions: true });

    expect(fingerprint(a)).not.toBe(fingerprint(b));
  });

  it("nenhuma alternativa some nem se duplica", () => {
    const variant = buildVariant({ label: "A", seed: 77, questions });

    for (const [index, question] of variant.questions.entries()) {
      const original = questions[index]?.optionIds ?? [];
      expect([...question.optionIds].sort()).toEqual([...original].sort());
    }
  });

  it("a letra é projeção da posição na variante", () => {
    // D9/§8.5: o endereço continua sendo o id; a letra é só o que se imprime.
    const variant = buildVariant({ label: "A", seed: 3, questions });
    const first = variant.questions[0] as NonNullable<(typeof variant.questions)[0]>;

    expect(first.labelByOptionId[first.optionIds[0] as string]).toBe("a");
    expect(first.labelByOptionId[first.optionIds[4] as string]).toBe("e");
  });

  it("alternativa presa fica no fim", () => {
    // "Nenhuma das anteriores" antes de uma alternativa comum não é embaralhamento, é erro de
    // prova.
    const variant = buildVariant({
      label: "A",
      seed: 5,
      questions: [
        {
          questionId: "q",
          optionIds: ["o0", "o1", "o2", "nda"],
          pinnedLastOptionIds: ["nda"],
        },
      ],
    });

    const order = variant.questions[0]?.optionIds ?? [];
    expect(order.at(-1)).toBe("nda");
    expect(variant.questions[0]?.labelByOptionId["nda"]).toBe("d");
  });

  it("`shuffleOptions: false` preserva a ordem original", () => {
    const variant = buildVariant({
      label: "A",
      seed: 5,
      questions: [{ questionId: "q", optionIds: ["o0", "o1", "o2"], shuffleOptions: false }],
    });

    expect(variant.questions[0]?.optionIds).toEqual(["o0", "o1", "o2"]);
  });
});

describe("o gabarito", () => {
  it("sai do **mapa**, não de um novo embaralhamento", () => {
    // A diferença entre conferir contra o que foi impresso e torcer para dar o mesmo.
    const variant = buildVariant({ label: "A", seed: 99, questions });
    const correct = Object.fromEntries(
      questions.map((q) => [q.questionId, `${q.questionId.replace("q-", "q")}-o2`]),
    );

    const key = answerKey(variant, correct);

    for (const question of variant.questions) {
      const expected = question.labelByOptionId[correct[question.questionId] as string];
      expect(key[question.questionId]).toBe(expected);
    }
  });

  it("a mesma questão recebe letras diferentes em variantes diferentes", () => {
    // É o ponto de ter variantes — e a razão de o mapa existir.
    const a = buildVariant({ label: "A", seed: 1, questions });
    const b = buildVariant({ label: "B", seed: 2, questions });

    const correct = Object.fromEntries(
      questions.map((q) => [q.questionId, `${q.questionId.replace("q-", "q")}-o0`]),
    );

    expect(answerKey(a, correct)).not.toEqual(answerKey(b, correct));
  });

  it("correta que não está na variante **falha**, em vez de virar traço", () => {
    // Dado incoerente precisa aparecer antes de a prova ser impressa.
    const variant = buildVariant({ label: "A", seed: 1, questions });

    expect(() => answerKey(variant, { "q-0": "inexistente" })).toThrow(/não está na variante/);
  });

  it("questão sem gabarito declarado simplesmente não entra na chave", () => {
    const variant = buildVariant({ label: "A", seed: 1, questions });
    expect(answerKey(variant, {})).toEqual({});
  });
});

describe("distribuição", () => {
  it("nenhuma alternativa prefere uma posição", () => {
    // Medido com 60 mil provas fora do teste: desvio máximo de 2,57%. Aqui uma amostra menor,
    // com folga — o que se quer pegar é viés **sistemático**, não ruído.
    const positions = Array.from({ length: 5 }, () => new Array<number>(5).fill(0));

    for (let seed = 0; seed < 4_000; seed += 1) {
      const variant = buildVariant({
        label: "A",
        seed,
        questions: [{ questionId: "q", optionIds: ["o0", "o1", "o2", "o3", "o4"] }],
      });

      for (const [position, id] of (variant.questions[0]?.optionIds ?? []).entries()) {
        const option = Number(id.slice(1));
        (positions[option] as number[])[position] =
          ((positions[option] as number[])[position] ?? 0) + 1;
      }
    }

    const expected = 4_000 / 5;
    for (const row of positions) {
      for (const count of row) {
        expect(Math.abs(count - expected) / expected).toBeLessThan(0.12);
      }
    }
  });
});
