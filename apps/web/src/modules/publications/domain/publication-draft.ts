/**
 * O que basta para cadastrar um livro.
 *
 * A regra do design (ajustes finais §5) é explícita: **não tornar tudo obrigatório**. Só o título
 * é exigido — o resto o autor completa depois, quando tiver o livro na mão. Um formulário que
 * pede ISBN antes de deixar começar é um formulário que faz o autor desistir da primeira sessão.
 */

export class InvalidPublicationError extends Error {
  constructor(
    message: string,
    /** Campo do formulário, para a UI marcar o input em vez de só mostrar um banner. */
    readonly field: string,
  ) {
    super(message);
    this.name = "InvalidPublicationError";
  }
}

export const PUBLICATION_TITLE_MAX = 300;

/** Ano do primeiro livro impresso; abaixo disso é digitação, não edição. */
const YEAR_MIN = 1450;

export interface PublicationDraft {
  readonly title: string;
  readonly subtitle: string | null;
  readonly nickname: string | null;
  readonly authors: readonly string[];
  readonly publisher: string | null;
  readonly edition: string | null;
  readonly editionYear: number | null;
  readonly isbn: string | null;
  readonly language: string | null;
  readonly series: string | null;
  readonly volume: string | null;
  readonly notes: string | null;
}

export interface PublicationDraftInput {
  readonly title?: unknown;
  readonly subtitle?: unknown;
  readonly nickname?: unknown;
  readonly authors?: unknown;
  readonly publisher?: unknown;
  readonly edition?: unknown;
  readonly editionYear?: unknown;
  readonly isbn?: unknown;
  readonly language?: unknown;
  readonly series?: unknown;
  readonly volume?: unknown;
  readonly notes?: unknown;
}

/**
 * Normaliza o formulário e recusa o que não é dado.
 *
 * `maxYear` entra por parâmetro em vez de `new Date()` aqui dentro: o domínio não lê relógio, e é
 * o que permite testar "ano no futuro" sem congelar o tempo do processo inteiro.
 */
export function parsePublicationDraft(
  input: PublicationDraftInput,
  maxYear: number,
): PublicationDraft {
  const title = text(input.title, "title", PUBLICATION_TITLE_MAX);
  if (title === null) throw new InvalidPublicationError("O título é obrigatório.", "title");

  return {
    title,
    subtitle: text(input.subtitle, "subtitle", 300),
    nickname: text(input.nickname, "nickname", 120),
    authors: parseAuthors(input.authors),
    publisher: text(input.publisher, "publisher", 200),
    edition: text(input.edition, "edition", 60),
    editionYear: parseYear(input.editionYear, maxYear),
    isbn: parseIsbn(input.isbn),
    language: text(input.language, "language", 20),
    series: text(input.series, "series", 200),
    volume: text(input.volume, "volume", 60),
    notes: text(input.notes, "notes", 4000),
  };
}

/** Texto opcional: vazio e ausente são a mesma coisa — `null`, não `""`. */
function text(value: unknown, field: string, max: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new InvalidPublicationError(`${field} precisa ser texto.`, field);

  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed === "") return null;
  if (trimmed.length > max) {
    throw new InvalidPublicationError(`Passa de ${max} caracteres.`, field);
  }
  return trimmed;
}

/**
 * Autores, na ordem em que foram digitados.
 *
 * A ordem é dado editorial — "Silva, Souza e Costa" não é o mesmo crédito que "Costa, Souza e
 * Silva" —, e é por isso que `PublicationAuthor` tem `position`. Repetidos caem fora: o mesmo
 * autor duas vezes é engano de digitação, e a tabela de junção recusaria de qualquer forma.
 */
function parseAuthors(value: unknown): readonly string[] {
  if (value === null || value === undefined) return [];

  const list = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(";")
      : (() => {
          throw new InvalidPublicationError("Autores precisa ser lista de nomes.", "authors");
        })();

  const seen = new Set<string>();
  const authors: string[] = [];

  for (const entry of list) {
    const name = text(entry, "authors", 200);
    if (name === null) continue;

    const key = name.toLocaleLowerCase("pt-BR");
    if (seen.has(key)) continue;
    seen.add(key);
    authors.push(name);
  }

  if (authors.length > 40) throw new InvalidPublicationError("Autores demais.", "authors");
  return authors;
}

function parseYear(value: unknown, maxYear: number): number | null {
  if (value === null || value === undefined || value === "") return null;

  const year = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(year)) {
    throw new InvalidPublicationError("O ano precisa ser um número inteiro.", "editionYear");
  }
  if (year < YEAR_MIN || year > maxYear) {
    throw new InvalidPublicationError(
      `O ano precisa estar entre ${YEAR_MIN} e ${maxYear}.`,
      "editionYear",
    );
  }
  return year;
}

/**
 * ISBN sem hífen nem espaço, e com o dígito verificador conferido.
 *
 * Conferir aqui e não só no banco porque um ISBN errado só aparece quando alguém tenta achar o
 * livro por ele — meses depois, sem pista de onde veio. O `X` de ISBN-10 é dígito legítimo e
 * sobe para maiúscula; a comparação depois é exata.
 */
function parseIsbn(value: unknown): string | null {
  const raw = text(value, "isbn", 40);
  if (raw === null) return null;

  const isbn = raw.replace(/[\s-]/g, "").toUpperCase();

  if (/^\d{9}[\dX]$/.test(isbn) && isbn10CheckDigit(isbn)) return isbn;
  if (/^\d{13}$/.test(isbn) && isbn13CheckDigit(isbn)) return isbn;

  throw new InvalidPublicationError("ISBN inválido — confira os dígitos.", "isbn");
}

function isbn10CheckDigit(isbn: string): boolean {
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const char = isbn[i] as string;
    sum += (char === "X" ? 10 : Number(char)) * (10 - i);
  }
  return sum % 11 === 0;
}

function isbn13CheckDigit(isbn: string): boolean {
  let sum = 0;
  for (let i = 0; i < 13; i++) sum += Number(isbn[i]) * (i % 2 === 0 ? 1 : 3);
  return sum % 10 === 0;
}
