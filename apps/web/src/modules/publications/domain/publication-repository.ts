/**
 * Porta de persistência de `Publication`.
 *
 * Vive no `domain/` do módulo que a possui, e declara só os métodos que este agregado
 * realmente usa — não há `Repository<T>` genérico (D23).
 */

export interface PublicationSummary {
  readonly id: string;
  /**
   * O workspace dono.
   *
   * Entra no resumo porque a chave de storage é prefixada por ele: uma tela que sobe arquivo
   * precisa saber para onde, e descobrir isso com uma segunda consulta seria pedir ao chamador
   * que remontasse a relação que o repositório já tinha em mãos.
   */
  readonly workspaceId: string;
  readonly title: string;
  readonly nickname: string | null;
  readonly publisher: string | null;
  /** Quantos nós a árvore tem, para a lista dizer algo útil sem carregar a árvore inteira. */
  readonly nodeCount: number;
}

/**
 * A publicação inteira, como o cadastro a vê.
 *
 * Separada de `PublicationSummary` de propósito: a lista da biblioteca mostra dezenas de livros e
 * não precisa de nada disto, e carregar autores e notas para desenhar uma lista seria pagar por
 * dado que a tela descarta.
 */
export interface PublicationDetail extends PublicationSummary {
  readonly subtitle: string | null;
  readonly authors: readonly string[];
  readonly edition: string | null;
  readonly editionYear: number | null;
  readonly isbn: string | null;
  readonly language: string | null;
  readonly series: string | null;
  readonly volume: string | null;
  readonly notes: string | null;
  readonly coverAssetId: string | null;
  readonly sourcePdfAssetId: string | null;
  readonly questionCount: number;
  readonly updatedAt: Date;
}

/** O que o cadastro manual grava. Só `title` é exigido — ver `parsePublicationDraft`. */
export interface PublicationWrite {
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

export interface PublicationRepository {
  listByWorkspaceSlug(slug: string): Promise<readonly PublicationSummary[]>;
  listByWorkspaceId(workspaceId: string): Promise<readonly PublicationSummary[]>;
  findById(id: string): Promise<PublicationSummary | null>;
  findDetailById(id: string): Promise<PublicationDetail | null>;
  create(workspaceId: string, write: PublicationWrite): Promise<PublicationDetail>;
  update(id: string, write: PublicationWrite): Promise<PublicationDetail | null>;
}
