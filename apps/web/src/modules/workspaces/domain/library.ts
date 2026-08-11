/**
 * Biblioteca — o que o produto chama de acervo, e o que o schema chama de `Workspace`.
 *
 * O nome interno vem do import legado (`IdBiblio` de `padrao.knowchicoconfig`) e fica onde está:
 * renomear a tabela agora seria migração sem ganho nenhum para quem usa. A regra é a outra ponta —
 * **a UI nunca diz "workspace"**, e é este módulo que sustenta a tradução.
 */

export class InvalidLibraryNameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidLibraryNameError";
  }
}

export class DuplicateLibraryError extends Error {
  /** `libraryName` e não `name`: `Error.name` já existe e é o nome da **classe**. */
  constructor(readonly libraryName: string) {
    super(`Já existe uma biblioteca chamada “${libraryName}”.`);
    this.name = "DuplicateLibraryError";
  }
}

export class LibraryNotFoundError extends Error {
  constructor(readonly id: string) {
    super(`Biblioteca ${id} não existe.`);
    this.name = "LibraryNotFoundError";
  }
}

export const LIBRARY_NAME_MAX = 120;

/**
 * Normaliza e recusa o que não é nome.
 *
 * Recusa vazio e recusa nome que só tem pontuação — porque o slug derivado ficaria vazio, e uma
 * biblioteca sem slug some da URL sem dizer por quê.
 */
export function normalizeLibraryName(raw: unknown): string {
  if (typeof raw !== "string") throw new InvalidLibraryNameError("O nome é obrigatório.");

  const name = raw.trim().replace(/\s+/g, " ");
  if (name === "") throw new InvalidLibraryNameError("O nome é obrigatório.");
  if (name.length > LIBRARY_NAME_MAX) {
    throw new InvalidLibraryNameError(`O nome passa de ${LIBRARY_NAME_MAX} caracteres.`);
  }
  if (slugifyLibrary(name) === "") {
    throw new InvalidLibraryNameError("O nome precisa ter ao menos uma letra ou número.");
  }

  return name;
}

/**
 * Slug estável a partir do nome.
 *
 * Decompõe antes de remover diacrítico: `"Matemática"` vira `matematica`, não `matemtica`. É o
 * mesmo cuidado que a memória do projeto registra sobre não-ASCII — acento perdido em silêncio é
 * o tipo de erro que só aparece na URL do usuário, meses depois.
 */
export function slugifyLibrary(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

/**
 * Desempata slug contra os que já existem.
 *
 * Sufixo numérico e não uuid: o slug aparece na URL, e `acervo-2` continua legível enquanto
 * `acervo-9f3c1a` não diz nada. A unicidade real continua sendo do banco — isto só evita que o
 * caso comum vire erro.
 */
export function uniqueSlug(base: string, taken: readonly string[]): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;

  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
}
