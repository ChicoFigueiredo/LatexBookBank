/**
 * Porta de persistência de `Biblioteca`.
 *
 * Só os métodos que o agregado usa — não há `Repository<T>` genérico (D23). `listSlugs` existe
 * porque quem decide o slug é o domínio (`uniqueSlug`), e ele precisa saber o que já está tomado
 * sem carregar a lista inteira de bibliotecas com contagens.
 */

export interface LibrarySummary {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  /** Quantos livros a biblioteca tem — o que a Home mostra sem abrir nada. */
  readonly publicationCount: number;
  readonly updatedAt: Date;
}

export interface LibraryRepository {
  list(): Promise<readonly LibrarySummary[]>;
  findById(id: string): Promise<LibrarySummary | null>;
  findBySlug(slug: string): Promise<LibrarySummary | null>;
  listSlugs(): Promise<readonly string[]>;
  /** `true` quando já existe biblioteca com este nome, comparando sem caixa nem acento. */
  existsByName(name: string): Promise<boolean>;
  create(input: { name: string; slug: string }): Promise<LibrarySummary>;
  rename(id: string, name: string): Promise<LibrarySummary | null>;
}
