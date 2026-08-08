import { generateKeyBetween } from "@modules/document-tree/domain/fractional-index";

/**
 * As operações sobre alternativas, como funções puras.
 *
 * Mesma decisão da árvore: a regra vive aqui, e o repositório só grava o que ela decidiu. É o que
 * permite testar "o gabarito sobrevive a isto" sem banco — e o gabarito precisa sobreviver a
 * **toda** operação, não só ao embaralhar, que é o caso que a spec cita.
 *
 * O `sortKey` é fractional index, o mesmo da árvore (spec §8.3): reordenar uma alternativa não
 * pode exigir reescrever as outras, e duas pessoas reordenando ao mesmo tempo não podem produzir
 * chaves iguais.
 */

export interface OptionRecord {
  readonly id: string;
  readonly sortKey: string;
  readonly statementLatex: string;
  readonly solutionLatex: string;
  readonly isCorrect: boolean;
}

/** O que muda numa alternativa. Ausente = não mexe. */
export interface OptionPatch {
  readonly id: string;
  readonly sortKey?: string;
  readonly isCorrect?: boolean;
}

export class OptionNotFoundError extends Error {
  constructor(readonly optionId: string) {
    super(`Alternativa ${optionId} não existe nesta questão.`);
    this.name = "OptionNotFoundError";
  }
}

/** Ordena por `sortKey`, em bytes — a mesma ordem que o banco usa (D38). */
const byKey = (a: OptionRecord, b: OptionRecord): number =>
  a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0;

export const sortOptions = (options: readonly OptionRecord[]): OptionRecord[] =>
  [...options].sort(byKey);

/**
 * A chave de uma alternativa nova, no fim da lista.
 *
 * No fim, e não no começo: quem acrescenta uma alternativa está continuando a lista, e inserir no
 * topo empurraria o gabarito visual de todo mundo para baixo por um gesto que não pedia isso.
 */
export function keyForNewOption(options: readonly OptionRecord[]): string {
  const sorted = sortOptions(options);
  const last = sorted[sorted.length - 1];
  return generateKeyBetween(last?.sortKey ?? null, null);
}

/**
 * A chave para mover `optionId` para a posição `targetIndex` da lista **visível**.
 *
 * O índice é da lista já ordenada, porque é o que o drag entrega: a pessoa arrastou para a
 * terceira posição, não para "entre a chave `a1` e a `a2`".
 */
export function keyForMove(
  options: readonly OptionRecord[],
  optionId: string,
  targetIndex: number,
): string {
  const sorted = sortOptions(options);
  if (!sorted.some((option) => option.id === optionId)) throw new OptionNotFoundError(optionId);

  // A alternativa que está sendo movida sai da lista antes de calcular os vizinhos. Sem isso,
  // mover para a posição seguinte à própria calcularia a chave "entre ela mesma e o vizinho" e
  // devolveria uma chave que não muda nada.
  const others = sorted.filter((option) => option.id !== optionId);
  const index = Math.max(0, Math.min(targetIndex, others.length));

  return generateKeyBetween(others[index - 1]?.sortKey ?? null, others[index]?.sortKey ?? null);
}

/**
 * Marca uma alternativa como correta.
 *
 * Em **múltipla escolha**, marcar uma desmarca as outras: o tipo diz "escolha uma", e deixar duas
 * marcadas produziria gabarito ambíguo que só apareceria na validação, depois. Em tipos de
 * múltiplas corretas, marcar é alternar, e as outras não são tocadas.
 *
 * Devolve **patches**, não a lista inteira: quem grava precisa saber o que mudou, e mandar todas
 * as alternativas de volta faria uma escrita de cinco linhas onde bastava uma.
 */
export function patchesForCorrect(
  options: readonly OptionRecord[],
  optionId: string,
  exclusive: boolean,
): readonly OptionPatch[] {
  const target = options.find((option) => option.id === optionId);
  if (target === undefined) throw new OptionNotFoundError(optionId);

  if (!exclusive) {
    return [{ id: optionId, isCorrect: !target.isCorrect }];
  }

  // Já era a correta e é exclusiva: desmarcar deixaria a questão sem gabarito, que é erro de
  // validação. Clicar de novo na correta não faz nada — é o comportamento de rádio, e é o que a
  // pessoa espera.
  if (target.isCorrect) return [];

  return options
    .filter((option) => option.isCorrect || option.id === optionId)
    .map((option) => ({ id: option.id, isCorrect: option.id === optionId }));
}

/**
 * Embaralha para **visualização**.
 *
 * Não devolve patches de propósito: embaralhar é o que a pessoa vê, não o que fica gravado. O
 * legado embaralhava gravando, e era isso que fazia o gabarito seguir a letra em vez da
 * alternativa. Aqui a ordem visual é estado de tela, e o `sortKey` continua onde estava.
 */
export function shuffledForDisplay(
  options: readonly OptionRecord[],
  random: () => number,
): OptionRecord[] {
  const shuffled = sortOptions(options);
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const a = shuffled[i];
    const b = shuffled[j];
    if (a !== undefined && b !== undefined) {
      shuffled[i] = b;
      shuffled[j] = a;
    }
  }
  return shuffled;
}
