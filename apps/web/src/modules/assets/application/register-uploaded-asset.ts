import {
  bookSourceTargetOf,
  type AssetWriter,
  type NewAsset,
  type WrittenAsset,
} from "@modules/assets/domain/book-source";

import type { StoredAssetRecord } from "./store-asset";

/**
 * Registrar no acervo o arquivo que acabou de ser guardado.
 *
 * O passo que vem depois do `storeAsset`: o conteúdo já está no `StorageProvider`, e o que falta é
 * a linha que diz de quem ele é. Este caso de uso existe porque essa segunda metade **tem uma
 * regra** — a de `book-source.ts` — e ela não podia morar num `if` dentro do route handler: a rota
 * é fina de propósito, e a mesma regra vale para qualquer caminho que registre um upload.
 *
 * Ver spec §10 · D29 · issue #123.
 */

export interface RegisterUploadedAssetCommand {
  /** O que o `storeAsset` devolveu — conteúdo já gravado, identidade já calculada. */
  readonly record: StoredAssetRecord;
  readonly workspaceId: string;
  /**
   * O livro de onde o upload partiu.
   *
   * Nulo é caso legítimo: `/api/assets` é a rota de upload do produto inteiro, e nem todo arquivo
   * nasce dentro de um livro. Hoje quem sobe pela ingestão sempre tem um — a tela só existe em
   * `/publications/[id]/ingestao` — mas a rota não depende disso.
   */
  readonly publicationId: string | null;
  readonly questionId: string | null;
}

export async function registerUploadedAsset(
  deps: { readonly assets: AssetWriter },
  command: RegisterUploadedAssetCommand,
): Promise<WrittenAsset> {
  const { record } = command;

  // Projeção campo a campo, e não `...record`: `NewAsset` é o contrato do que o banco guarda, e um
  // espalhamento mandaria junto o que o `StoredAssetRecord` ganhar amanhã.
  const asset: NewAsset = {
    workspaceId: command.workspaceId,
    publicationId: command.publicationId,
    questionId: command.questionId,
    kind: record.kind,
    storageKey: record.storageKey,
    mimeType: record.mimeType,
    originalFilename: record.originalFilename,
    sha256: record.sha256,
    sizeBytes: record.sizeBytes,
    width: record.width,
    height: record.height,
  };

  return deps.assets.write(asset, bookSourceTargetOf(asset));
}
