/**
 * Fronteira primária: **Storage**.
 *
 * O domínio conhece `StorageKey` — nunca `D:\KnowChico\...`, `/mnt/t/...` ou
 * `https://algum-storage/...`. Path e URL são responsabilidade do provider.
 *
 * Implementação inicial: `LocalFileStorageProvider` (D26).
 * Candidato cloud: `VercelBlobStorageProvider`. Possibilidade futura: `S3StorageProvider`.
 *
 * Ver `docs/_atual/_planejamento.md` §4.7 · D26 · D29.
 */

/**
 * Chave opaca de storage. O formato é decidido pelo provider e nunca interpretado por quem
 * consome — o branding impede que uma `string` qualquer seja passada por engano.
 */
export type StorageKey = string & { readonly __storageKey: unique symbol };

export const asStorageKey = (value: string): StorageKey => value as StorageKey;

export interface PutAssetInput {
  /** Prefixo de isolamento. Nenhuma chave escapa do workspace que a gerou. */
  readonly workspaceId: string;
  readonly content: Uint8Array;
  readonly mimeType: string;
  readonly originalFilename?: string;
}

export interface StoredAsset {
  readonly storageKey: StorageKey;
  /** Eixo de identidade, integridade, deduplicação, cache e auditoria (D29). */
  readonly sha256: string;
  readonly sizeBytes: number;
}

export interface StoredContent {
  readonly content: Uint8Array;
  readonly mimeType: string;
  readonly sizeBytes: number;
}

export interface StorageProvider {
  put(input: PutAssetInput): Promise<StoredAsset>;
  get(key: StorageKey): Promise<StoredContent>;
  exists(key: StorageKey): Promise<boolean>;
  delete(key: StorageKey): Promise<void>;
}

/** Lançado quando a chave pedida não existe. Distinguir de falha de transporte importa. */
export class AssetNotFoundError extends Error {
  constructor(readonly storageKey: StorageKey) {
    super(`Asset não encontrado: ${storageKey}`);
    this.name = "AssetNotFoundError";
  }
}

/**
 * Lançado quando uma chave tentaria sair do prefixo do seu workspace.
 *
 * Vale para o adapter local, onde `../` escaparia do diretório, e para os remotos, onde a
 * chave é o único isolamento entre workspaces.
 */
export class StorageKeyEscapeError extends Error {
  constructor(
    readonly workspaceId: string,
    readonly attempted: string,
  ) {
    super(`Chave "${attempted}" escapa do workspace ${workspaceId}`);
    this.name = "StorageKeyEscapeError";
  }
}
