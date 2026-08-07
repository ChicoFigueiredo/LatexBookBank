/**
 * Porta de persistência de `Publication`.
 *
 * Vive no `domain/` do módulo que a possui, e declara só os métodos que este agregado
 * realmente usa — não há `Repository<T>` genérico (D23).
 */

export interface PublicationSummary {
  readonly id: string;
  readonly title: string;
  readonly nickname: string | null;
  readonly publisher: string | null;
  /** Quantos nós a árvore tem, para a lista dizer algo útil sem carregar a árvore inteira. */
  readonly nodeCount: number;
}

export interface PublicationRepository {
  listByWorkspaceSlug(slug: string): Promise<readonly PublicationSummary[]>;
  findById(id: string): Promise<PublicationSummary | null>;
}
