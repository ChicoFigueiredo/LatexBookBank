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
  /** Opcional de verdade: `null` quando não há, nunca `""`. */
  readonly description: string | null;
  /** Quantos livros a biblioteca tem — o que a Home mostra sem abrir nada. */
  readonly publicationCount: number;
  readonly updatedAt: Date;
}

/**
 * O que a exclusão vai levar junto.
 *
 * Existe para o diálogo de confirmação poder dizer o tamanho do estrago **antes** dele acontecer.
 * `publicationCount` do `LibrarySummary` não basta: quem hesita hesita pelas questões.
 */
export interface LibraryContents {
  readonly publicationCount: number;
  readonly questionCount: number;
  /** Imagens, PDFs de origem e artefatos de render — tudo que tem arquivo no storage. */
  readonly assetCount: number;
}

export interface LibraryRepository {
  list(): Promise<readonly LibrarySummary[]>;
  findById(id: string): Promise<LibrarySummary | null>;
  findBySlug(slug: string): Promise<LibrarySummary | null>;
  listSlugs(): Promise<readonly string[]>;
  /** `true` quando já existe biblioteca com este nome, comparando sem caixa nem acento. */
  existsByName(name: string): Promise<boolean>;
  create(input: { name: string; slug: string; description: string | null }): Promise<LibrarySummary>;
  rename(id: string, name: string): Promise<LibrarySummary | null>;
  /** O que existe dentro da biblioteca, para a confirmação. `null` quando ela não existe. */
  contentsOf(id: string): Promise<LibraryContents | null>;
  /**
   * As chaves de storage dos assets da biblioteca, **sem repetição**.
   *
   * Sem repetição porque `Asset.storageKey` não é única desde a #156: duas referências ao mesmo
   * objeto guardado são o caso normal. Quem apaga arquivo quer a lista de objetos, não de linhas.
   */
  listAssetKeys(id: string): Promise<readonly string[]>;
  /** Apaga a biblioteca e tudo que pende dela. `false` quando ela já não existia. */
  delete(id: string): Promise<boolean>;
}
