/**
 * Fractional indexing — ordenação sem reescrever a árvore (spec §8.3).
 *
 * Reordenar um nó altera **uma** linha. Com `Ordem` inteira, mover o primeiro item de uma
 * publicação de 300 nós reescreveria 300 linhas; no legado isso levou a `Ordem = 0` em quase
 * todas elas, e foi por isso que D12 decidiu ignorar aquele campo na importação.
 *
 * A chave é uma string que se compara **lexicograficamente**: entre duas chaves quaisquer sempre
 * cabe outra. O algoritmo é o de David Greenspan popularizado por Figma, na formulação da
 * biblioteca `fractional-indexing` (rocicorp, MIT) — reescrito aqui em TypeScript estrito, para
 * ficar no domínio, sem dependência, e com os invariantes afirmados por teste de propriedade.
 *
 * A chave tem duas partes:
 * - **inteiro**: primeiro caractere codifica sinal e comprimento (`A`–`Z` negativos, `a`–`z`
 *   positivos), seguido dos dígitos. `a0` é o zero.
 * - **fracionário**: o resto, usado quando não sobra inteiro entre os vizinhos.
 *
 * ⚠️ **Colação.** A ordem é a de bytes. O SQLite compara TEXT em binário por padrão, então serve
 * direto. O PostgreSQL usa a colação do banco, que em `en_US.UTF-8` ordena ignorando caixa — e
 * `a0` viria antes de `Z0`, invertendo a ordem lógica. Ao migrar (Fase 6.5), a coluna `sortKey`
 * precisa de `COLLATE "C"`. Está afirmado no teste de portabilidade.
 */

const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** `a0` — o zero. Primeira chave de uma lista vazia. */
export const FIRST_KEY = "a0";

/** `A` + 26 zeros: o menor inteiro representável. Abaixo dele não há para onde decrementar. */
const SMALLEST_INTEGER = "A00000000000000000000000000";

export class InvalidSortKeyError extends Error {
  constructor(key: string, reason: string) {
    super(`sortKey inválida ${JSON.stringify(key)}: ${reason}`);
    this.name = "InvalidSortKeyError";
  }
}

export class SortKeyExhaustedError extends Error {
  constructor(direction: "início" | "fim") {
    super(
      `A faixa de sortKey acabou no ${direction} da lista. ` +
        `Isso exige rebalanceamento — não deve acontecer em uso normal.`,
    );
    this.name = "SortKeyExhaustedError";
  }
}

/** Índice do dígito, ou erro — `indexOf` devolvendo -1 viraria corrupção silenciosa. */
function digitAt(char: string): number {
  const index = DIGITS.indexOf(char);
  if (index < 0) throw new InvalidSortKeyError(char, "caractere fora do alfabeto base-62");
  return index;
}

const digit = (index: number): string => {
  const char = DIGITS[index];
  if (char === undefined) throw new InvalidSortKeyError(String(index), "dígito fora da faixa");
  return char;
};

/**
 * Comprimento da parte inteira, lido do primeiro caractere.
 *
 * `a`→2, `b`→3 … e simetricamente `Z`→2, `Y`→3 para o lado negativo. É o que permite ler a chave
 * sem separador: o primeiro caractere já diz onde o inteiro termina.
 */
function integerLength(head: string): number {
  if (head >= "a" && head <= "z") return head.charCodeAt(0) - "a".charCodeAt(0) + 2;
  if (head >= "A" && head <= "Z") return "Z".charCodeAt(0) - head.charCodeAt(0) + 2;
  throw new InvalidSortKeyError(head, "cabeçalho de inteiro inválido");
}

function integerPart(key: string): string {
  const head = key[0];
  if (head === undefined) throw new InvalidSortKeyError(key, "chave vazia");

  const length = integerLength(head);
  if (length > key.length) throw new InvalidSortKeyError(key, "parte inteira truncada");
  return key.slice(0, length);
}

function assertValidInteger(value: string): void {
  const head = value[0];
  if (head === undefined || value.length !== integerLength(head)) {
    throw new InvalidSortKeyError(value, "comprimento não bate com o cabeçalho");
  }
}

/**
 * Valida uma chave vinda de fora — banco, import, patch do agente.
 *
 * Zero à direita é recusado porque quebra a unicidade: `a01` e `a010` ordenariam igual e
 * representariam a mesma posição com bytes diferentes.
 */
export function assertValidSortKey(key: string): void {
  if (key === SMALLEST_INTEGER) throw new InvalidSortKeyError(key, "é o menor inteiro reservado");

  const integer = integerPart(key);
  assertValidInteger(integer);

  const fraction = key.slice(integer.length);
  if (fraction.endsWith("0"))
    throw new InvalidSortKeyError(key, "parte fracionária com zero final");
  for (const char of fraction) digitAt(char);
}

export const isValidSortKey = (key: string): boolean => {
  try {
    assertValidSortKey(key);
    return true;
  } catch {
    return false;
  }
};

function incrementInteger(value: string): string | null {
  assertValidInteger(value);
  const [head, ...digits] = value.split("");
  if (head === undefined) return null;

  let carry = true;
  for (let i = digits.length - 1; carry && i >= 0; i--) {
    const next = digitAt(digits[i] as string) + 1;
    if (next === DIGITS.length) digits[i] = "0";
    else {
      digits[i] = digit(next);
      carry = false;
    }
  }

  if (!carry) return head + digits.join("");
  if (head === "Z") return FIRST_KEY;
  if (head === "z") return null;

  const nextHead = String.fromCharCode(head.charCodeAt(0) + 1);
  if (nextHead > "a") digits.push("0");
  else digits.pop();
  return nextHead + digits.join("");
}

function decrementInteger(value: string): string | null {
  assertValidInteger(value);
  const [head, ...digits] = value.split("");
  if (head === undefined) return null;

  const last = DIGITS.slice(-1);
  let borrow = true;
  for (let i = digits.length - 1; borrow && i >= 0; i--) {
    const next = digitAt(digits[i] as string) - 1;
    if (next === -1) digits[i] = last;
    else {
      digits[i] = digit(next);
      borrow = false;
    }
  }

  if (!borrow) return head + digits.join("");
  if (head === "a") return `Z${last}`;
  if (head === "A") return null;

  const previousHead = String.fromCharCode(head.charCodeAt(0) - 1);
  if (previousHead < "Z") digits.push(last);
  else digits.pop();
  return previousHead + digits.join("");
}

/** Ponto médio entre duas partes fracionárias. `before < resultado < after`. */
function midpoint(before: string, after: string | null): string {
  if (after !== null && before >= after) {
    throw new InvalidSortKeyError(`${before}|${after}`, "limites fora de ordem");
  }
  if (before.endsWith("0") || after?.endsWith("0")) {
    throw new InvalidSortKeyError(`${before}|${after}`, "zero final na fração");
  }

  if (after !== null) {
    // Prefixo comum sai do caminho: o problema fica sendo só o primeiro ponto de divergência.
    let common = 0;
    while ((before[common] ?? "0") === after[common]) common += 1;
    if (common > 0) {
      return after.slice(0, common) + midpoint(before.slice(common), after.slice(common));
    }
  }

  const low = before ? digitAt(before[0] as string) : 0;
  const high = after !== null ? digitAt(after[0] as string) : DIGITS.length;

  if (high - low > 1) return digit(Math.round(0.5 * (low + high)));

  // Dígitos consecutivos: não cabe nada entre eles neste nível, então desce um.
  if (after !== null && after.length > 1) return after.slice(0, 1);
  return digit(low) + midpoint(before.slice(1), null);
}

/**
 * Gera uma chave estritamente entre `before` e `after`.
 *
 * `null` em qualquer lado significa "extremo da lista": `(null, null)` é a primeira chave,
 * `(última, null)` acrescenta ao fim, `(null, primeira)` insere no começo.
 */
export function generateKeyBetween(before: string | null, after: string | null): string {
  if (before !== null) assertValidSortKey(before);
  if (after !== null) assertValidSortKey(after);
  if (before !== null && after !== null && before >= after) {
    throw new InvalidSortKeyError(`${before}|${after}`, "limites fora de ordem");
  }

  if (before === null) {
    if (after === null) return FIRST_KEY;

    const integer = integerPart(after);
    const fraction = after.slice(integer.length);
    if (integer === SMALLEST_INTEGER) return integer + midpoint("", fraction);
    if (integer < after) return integer;

    const decremented = decrementInteger(integer);
    if (decremented === null) throw new SortKeyExhaustedError("início");
    return decremented;
  }

  if (after === null) {
    const integer = integerPart(before);
    const fraction = before.slice(integer.length);
    const incremented = incrementInteger(integer);
    return incremented ?? integer + midpoint(fraction, null);
  }

  const beforeInteger = integerPart(before);
  const beforeFraction = before.slice(beforeInteger.length);
  const afterInteger = integerPart(after);
  const afterFraction = after.slice(afterInteger.length);

  if (beforeInteger === afterInteger) {
    return beforeInteger + midpoint(beforeFraction, afterFraction);
  }

  const incremented = incrementInteger(beforeInteger);
  if (incremented === null) throw new SortKeyExhaustedError("fim");
  if (incremented < after) return incremented;
  return beforeInteger + midpoint(beforeFraction, null);
}

/**
 * `count` chaves em ordem crescente entre `before` e `after`.
 *
 * Existe para a importação do legado (Fase 11) e para colar uma subárvore: gerar uma a uma
 * encadeando o resultado produz chaves cada vez mais longas — este divide a faixa ao meio a cada
 * passo, e mantém o comprimento sob controle.
 */
export function generateNKeysBetween(
  before: string | null,
  after: string | null,
  count: number,
): string[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new InvalidSortKeyError(String(count), "quantidade precisa ser inteiro não negativo");
  }
  if (count === 0) return [];
  if (count === 1) return [generateKeyBetween(before, after)];

  if (after === null) {
    let key = generateKeyBetween(before, null);
    const keys = [key];
    while (keys.length < count) {
      key = generateKeyBetween(key, null);
      keys.push(key);
    }
    return keys;
  }

  if (before === null) {
    let key = generateKeyBetween(null, after);
    const keys = [key];
    while (keys.length < count) {
      key = generateKeyBetween(null, key);
      keys.push(key);
    }
    return keys.reverse();
  }

  const half = Math.floor(count / 2);
  const middle = generateKeyBetween(before, after);
  return [
    ...generateNKeysBetween(before, middle, half),
    middle,
    ...generateNKeysBetween(middle, after, count - half - 1),
  ];
}

/**
 * Regenera as chaves de uma lista inteira de irmãos, uniformemente espaçadas.
 *
 * **Por que é necessário.** Inserir sempre no mesmo ponto é busca binária na faixa: cada
 * inserção consome ~1/6 de caractere, e mil delas produzem chaves de ~200 caracteres. Medido,
 * não estimado — o teste registra o número. Em uso editorial isso é raríssimo (ninguém insere
 * mil vezes na mesma posição), mas a importação do legado e o colar de subárvore conseguem
 * chegar lá.
 *
 * O custo é o oposto do resto do módulo: aqui **todas** as linhas de um nível são reescritas. Por
 * isso não roda sozinho — é operação explícita, disparada quando a maior chave de um nível passa
 * do limiar, e sempre dentro da mesma transação que a motivou.
 *
 * Devolve as chaves na ordem da lista recebida. Quem chama associa cada uma ao seu nó.
 */
export function rebalanceKeys(count: number): string[] {
  return generateNKeysBetween(null, null, count);
}

/**
 * Comprimento a partir do qual vale rebalancear um nível.
 *
 * 32 é folgado: chaves de uso normal ficam em 2–5 caracteres, e chegar a 32 significa ~180
 * inserções no mesmo ponto. Serve como sinal de que algo automatizado está inserindo em massa,
 * não de que o usuário exagerou.
 */
export const REBALANCE_THRESHOLD = 32;

export const needsRebalance = (keys: readonly string[]): boolean =>
  keys.some((key) => key.length >= REBALANCE_THRESHOLD);
