/**
 * O gerador determinístico das provas.
 *
 * `Math.random` está fora de questão: ele não aceita seed, e sem seed não existe "reproduzir a
 * mesma prova". Mas o requisito é mais forte que isso — a mesma seed precisa dar a mesma prova
 * **em processos diferentes**, o que descarta também qualquer coisa que dependa de ordem de
 * iteração de `Map`, de `Object.keys`, de hash de string do motor ou de ponto flutuante com
 * arredondamento variável.
 *
 * Daí este arquivo ser aritmética de inteiros de 32 bits e nada mais. `mulberry32` cabe em cinco
 * linhas, passa nos testes estatísticos que uma prova de múltipla escolha exige, e não tem estado
 * escondido.
 *
 * Ver spec §20 · issue #127.
 */

export interface Prng {
  /** Próximo inteiro sem sinal de 32 bits. */
  nextUint32(): number;
  /** Inteiro em `[0, bound)`. */
  nextBelow(bound: number): number;
}

/**
 * `mulberry32`, com o estado explícito.
 *
 * Todas as operações terminam em `>>> 0` ou `| 0`: sem isso, o número vira ponto flutuante de 53
 * bits e a sequência passa a depender de detalhes de arredondamento — que é exatamente o tipo de
 * coisa que reproduz num processo e diverge em outro.
 */
export function createPrng(seed: number): Prng {
  let state = seed >>> 0;

  const nextUint32 = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;

    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t = (t ^ (t + Math.imul(t ^ (t >>> 7), t | 61))) >>> 0;

    return (t ^ (t >>> 14)) >>> 0;
  };

  return {
    nextUint32,

    /**
     * Sem viés de módulo.
     *
     * `nextUint32() % bound` favorece os primeiros valores quando `bound` não divide 2³². Com
     * cinco alternativas o desvio é pequeno, mas ele é **sistemático**: a alternativa `a` sairia
     * em primeiro lugar com mais frequência em toda prova gerada, para sempre. Descartar a faixa
     * incompleta custa uma iteração ocasional e elimina isso.
     */
    nextBelow: (bound: number): number => {
      if (!Number.isInteger(bound) || bound < 1) {
        throw new RangeError(`O limite precisa ser um inteiro positivo: ${bound}`);
      }
      if (bound === 1) return 0;

      const limit = Math.floor(0x100000000 / bound) * bound;

      let value = nextUint32();
      while (value >= limit) value = nextUint32();

      return value % bound;
    },
  };
}

/**
 * Seed a partir de texto, para quem quiser nomear a prova em vez de decorar um número.
 *
 * FNV-1a de 32 bits, escrito à mão: `String.prototype.hashCode` não existe, e o hash interno do
 * motor não é estável entre versões — usá-lo faria a mesma seed dar provas diferentes depois de
 * um upgrade do runtime.
 */
export function seedFromString(text: string): number {
  let hash = 0x811c9dc5;

  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash >>> 0;
}

/**
 * Fisher–Yates, de trás para a frente.
 *
 * A implementação clássica, e não `sort(() => random() - 0.5)`: o segundo depende do algoritmo de
 * ordenação do motor, produz distribuição enviesada, e — pior para o requisito — pode diferir
 * entre versões de runtime. Aqui a permutação é função apenas da seed e do tamanho.
 *
 * A entrada não é modificada: embaralhar uma lista de alternativas não pode reordenar a lista que
 * a questão guarda.
 */
export function shuffle<T>(items: readonly T[], prng: Prng): T[] {
  const result = [...items];

  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = prng.nextBelow(i + 1);
    [result[i], result[j]] = [result[j] as T, result[i] as T];
  }

  return result;
}
