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

/**
 * A confirmação digitada não bate com o nome da biblioteca.
 *
 * A exclusão é permanente e leva livros, questões e arquivos junto. Digitar o nome é o que
 * transforma o gesto em decisão — e a checagem mora aqui, não só no diálogo: um `DELETE` disparado
 * por engano fora da tela precisa esbarrar na mesma trava.
 */
export class LibraryConfirmationMismatchError extends Error {
  constructor(readonly libraryName: string) {
    super(`Digite “${libraryName}” para confirmar a exclusão.`);
    this.name = "LibraryConfirmationMismatchError";
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

export const LIBRARY_DESCRIPTION_MAX = 400;

/**
 * Descrição é opcional, e "vazia" é `null`.
 *
 * Guardar `""` e `null` como coisas diferentes obrigaria toda leitura a tratar dos dois casos para
 * chegar à mesma conclusão. Aqui existe **um** jeito de não ter descrição.
 */
export function normalizeLibraryDescription(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") {
    throw new InvalidLibraryNameError("A descrição precisa ser texto.");
  }

  const description = raw.trim().replace(/[ \t]+/g, " ");
  if (description === "") return null;
  if (description.length > LIBRARY_DESCRIPTION_MAX) {
    throw new InvalidLibraryNameError(
      `A descrição passa de ${LIBRARY_DESCRIPTION_MAX} caracteres.`,
    );
  }

  return description;
}

/**
 * A confirmação digitada bate com o nome?
 *
 * Espaço em excesso é perdoado — quem copia o nome da tela às vezes leva um espaço junto. Caixa e
 * acento **não** são: aqui a comparação frouxa de `existsByName` trabalharia contra o propósito.
 * O ponto de digitar o nome é obrigar a olhar para qual biblioteca está sendo apagada.
 */
export function matchesLibraryName(typed: unknown, name: string): boolean {
  if (typeof typed !== "string") return false;
  return typed.trim().replace(/\s+/g, " ") === name;
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
