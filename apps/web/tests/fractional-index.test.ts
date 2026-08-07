import { describe, expect, it } from "vitest";

import {
  FIRST_KEY,
  InvalidSortKeyError,
  assertValidSortKey,
  generateKeyBetween,
  generateNKeysBetween,
  isValidSortKey,
  needsRebalance,
  rebalanceKeys,
} from "@modules/document-tree/domain/fractional-index";

/**
 * O invariante que sustenta a árvore inteira: **entre duas chaves quaisquer sempre cabe outra**, e
 * a ordem lexicográfica é a ordem lógica.
 *
 * Se isso falhar, reordenar embaralha o acervo em silêncio — o mesmo estrago que o campo `Ordem`
 * do legado causaria se tivéssemos confiado nele (D12).
 */

describe("chaves básicas", () => {
  it("a primeira chave de uma lista vazia é o zero", () => {
    expect(generateKeyBetween(null, null)).toBe(FIRST_KEY);
  });

  it("acrescentar ao fim cresce; inserir no começo decresce", () => {
    const first = generateKeyBetween(null, null);
    const last = generateKeyBetween(first, null);
    const zeroth = generateKeyBetween(null, first);

    expect(zeroth < first).toBe(true);
    expect(first < last).toBe(true);
  });

  it("entre duas vizinhas cabe uma terceira", () => {
    const a = generateKeyBetween(null, null);
    const b = generateKeyBetween(a, null);
    const middle = generateKeyBetween(a, b);

    expect(a < middle).toBe(true);
    expect(middle < b).toBe(true);
  });

  it("recusa limites fora de ordem", () => {
    const a = generateKeyBetween(null, null);
    const b = generateKeyBetween(a, null);

    expect(() => generateKeyBetween(b, a)).toThrow(InvalidSortKeyError);
    expect(() => generateKeyBetween(a, a)).toThrow(InvalidSortKeyError);
  });
});

describe("validação", () => {
  it("aceita o que ela mesma gera", () => {
    let key: string | null = null;
    for (let i = 0; i < 200; i++) {
      key = generateKeyBetween(key, null);
      expect(isValidSortKey(key)).toBe(true);
    }
  });

  it("recusa zero final — dois bytes diferentes para a mesma posição", () => {
    expect(() => assertValidSortKey("a01")).not.toThrow();
    expect(() => assertValidSortKey("a010")).toThrow(InvalidSortKeyError);
  });

  it("recusa lixo e chave truncada", () => {
    for (const bad of ["", "0", "a", "!!", "b0", "a0~"]) {
      expect(isValidSortKey(bad), bad).toBe(false);
    }
  });
});

describe("propriedade: a ordem é estrita e total", () => {
  /** Insere sempre no mesmo ponto — o caso que mais castiga o algoritmo. */
  it("mil inserções no mesmo ponto mantêm a ordem", () => {
    const first = generateKeyBetween(null, null);
    const last = generateKeyBetween(first, null);

    const keys = [first, last];
    for (let i = 0; i < 1000; i++) {
      const middle = generateKeyBetween(keys[0] as string, keys[1] as string);
      keys.splice(1, 0, middle);
    }

    for (let i = 1; i < keys.length; i++) {
      expect((keys[i - 1] as string) < (keys[i] as string), `posição ${i}`).toBe(true);
    }
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("inserções aleatórias produzem uma lista sempre ordenada", () => {
    // Sequência determinística: um teste de ordenação que falha só às vezes não serve de nada.
    let seed = 42;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    const keys = [generateKeyBetween(null, null)];
    for (let i = 0; i < 500; i++) {
      const at = Math.floor(next() * (keys.length + 1));
      const before = at === 0 ? null : (keys[at - 1] as string);
      const after = at === keys.length ? null : (keys[at] as string);
      keys.splice(at, 0, generateKeyBetween(before, after));
    }

    expect([...keys].sort()).toEqual(keys);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("comprimento não degenera", () => {
  it("mil acréscimos ao fim mantêm a chave curta", () => {
    let key = generateKeyBetween(null, null);
    for (let i = 0; i < 1000; i++) key = generateKeyBetween(key, null);

    // Só a parte inteira cresce, e devagar: 1000 itens cabem em pouquíssimos caracteres.
    expect(key.length).toBeLessThanOrEqual(5);
  });

  it("inserir sempre no mesmo ponto é o pior caso, e cresce — por isso existe rebalanceamento", () => {
    let low = generateKeyBetween(null, null);
    const high = generateKeyBetween(low, null);

    for (let i = 0; i < 1000; i++) low = generateKeyBetween(low, high);

    // Busca binária na faixa: cada inserção consome ~1/6 de caractere (log2(62) ≈ 5,95 bits).
    // Mil inserções ⇒ ~200 caracteres. Medido, não estimado — e é o número que justifica
    // `rebalanceKeys`. O limite superior existe para pegar regressão que faça isso explodir.
    expect(low.length).toBeGreaterThan(100);
    expect(low.length).toBeLessThan(260);
  });
});

describe("rebalanceamento", () => {
  it("devolve a lista degenerada a chaves curtas", () => {
    let low = generateKeyBetween(null, null);
    const high = generateKeyBetween(low, null);
    const degenerate = [low];
    for (let i = 0; i < 300; i++) {
      low = generateKeyBetween(low, high);
      degenerate.push(low);
    }
    degenerate.push(high);

    expect(needsRebalance(degenerate)).toBe(true);

    const rebalanced = rebalanceKeys(degenerate.length);

    expect(rebalanced).toHaveLength(degenerate.length);
    expect([...rebalanced].sort()).toEqual(rebalanced);
    expect(needsRebalance(rebalanced)).toBe(false);
    expect(Math.max(...rebalanced.map((k) => k.length))).toBeLessThan(8);
  });

  it("não pede rebalanceamento para uso normal", () => {
    let key = generateKeyBetween(null, null);
    const keys = [key];
    for (let i = 0; i < 500; i++) {
      key = generateKeyBetween(key, null);
      keys.push(key);
    }

    expect(needsRebalance(keys)).toBe(false);
  });

  it("preserva a ordem relativa: quem chama associa posição a posição", () => {
    const rebalanced = rebalanceKeys(50);
    for (let i = 1; i < rebalanced.length; i++) {
      expect((rebalanced[i - 1] as string) < (rebalanced[i] as string)).toBe(true);
    }
  });
});

describe("geração em lote", () => {
  it("devolve a quantidade pedida, em ordem", () => {
    const keys = generateNKeysBetween(null, null, 10);

    expect(keys).toHaveLength(10);
    expect([...keys].sort()).toEqual(keys);
  });

  it("respeita os dois limites quando eles existem", () => {
    const a = generateKeyBetween(null, null);
    const b = generateKeyBetween(a, null);
    const keys = generateNKeysBetween(a, b, 7);

    expect(keys).toHaveLength(7);
    expect([...keys].sort()).toEqual(keys);
    expect(a < (keys[0] as string)).toBe(true);
    expect((keys[6] as string) < b).toBe(true);
  });

  it("divide a faixa ao meio em vez de encadear — o lote fica muito mais curto", () => {
    const a = generateKeyBetween(null, null);
    const b = generateKeyBetween(a, null);

    const batch = generateNKeysBetween(a, b, 64);

    let chained = a;
    const chain: string[] = [];
    for (let i = 0; i < 64; i++) {
      chained = generateKeyBetween(chained, b);
      chain.push(chained);
    }

    const longestBatch = Math.max(...batch.map((k) => k.length));
    const longestChain = Math.max(...chain.map((k) => k.length));
    expect(longestBatch).toBeLessThan(longestChain);
  });

  it("zero chaves é uma lista vazia, e quantidade inválida é erro", () => {
    expect(generateNKeysBetween(null, null, 0)).toEqual([]);
    expect(() => generateNKeysBetween(null, null, -1)).toThrow(InvalidSortKeyError);
    expect(() => generateNKeysBetween(null, null, 1.5)).toThrow(InvalidSortKeyError);
  });
});

describe("portabilidade da ordenação", () => {
  /**
   * A ordem é a de **bytes**. O SQLite compara TEXT em binário e serve direto; o PostgreSQL usa a
   * colação do banco, e `en_US.UTF-8` ordena ignorando caixa — `a0` viria antes de `Z0` e a lista
   * inverteria. Este teste registra a exigência: na Fase 6.5, `sortKey` precisa de `COLLATE "C"`.
   */
  it("chaves negativas e positivas só ordenam certo em comparação binária", () => {
    const first = generateKeyBetween(null, null); // "a0"
    const before = generateKeyBetween(null, first); // parte negativa, começa com "Z"

    expect(before < first).toBe(true);
    expect(before[0]).toBe("Z");
    expect(first[0]).toBe("a");

    // Sob colação que ignora caixa, "Z…" e "a…" trocariam de lugar. Este é o cenário exato.
    const caseInsensitive = [first, before].sort((x, y) => x.localeCompare(y, "en"));
    expect(caseInsensitive[0]).toBe(first);
  });
});
