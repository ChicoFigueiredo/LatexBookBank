import type { NormalizedBox } from "@/shared/geometry/normalized-box";
import type { StorageProvider } from "@/shared/ports";

import { normalizeAnchor } from "../domain/source-anchor";
import { storeAsset, type StoredAssetRecord } from "./store-asset";

/**
 * Salvar um recorte: o arquivo do crop, o `Asset(CROP)`, a âncora — e, com questão, a ligação dela.
 *
 * A rota encadeava as quatro escritas sem transação (STE-03): uma falha na âncora deixava um
 * `Asset(CROP)` órfão no banco, que nenhuma fila mostrava e nenhum descarte alcançava. Aqui as três
 * linhas são gravadas juntas pela porta (`CropWriter.persist`), e só o arquivo vai antes — ele é
 * endereçado pelo conteúdo, e um arquivo sem linha é inofensivo: o próximo recorte igual o reusa.
 *
 * O `SOURCE_PDF` nunca é substituído (D29): o crop é um asset **novo**, e a âncora aponta para os
 * dois.
 *
 * Ver spec §18 · D28 · D29 · issues #123, #256.
 */

export interface CropSource {
  readonly id: string;
  readonly workspaceId: string;
}

export interface CropWriter {
  findSource(assetId: string): Promise<CropSource | null>;
  /**
   * O livro e a questão do recorte, conferidos contra a biblioteca do PDF (#256). `null` é "não
   * existe" ou "não é daqui", e as duas respostas são a mesma.
   */
  resolveOwner(claim: {
    readonly workspaceId: string;
    readonly publicationId: string;
    readonly questionId: string | null;
  }): Promise<{ readonly questionId: string | null } | null>;
  /** O asset do crop, a âncora e a ligação com a questão — numa transação. */
  persist(input: PersistCrop): Promise<{ readonly anchorId: string; readonly cropAssetId: string }>;
}

export interface PersistCrop {
  readonly crop: StoredAssetRecord & { readonly workspaceId: string };
  readonly anchor: {
    readonly publicationId: string;
    readonly sourceAssetId: string;
    readonly pageNumber: number;
    readonly box: NormalizedBox;
    readonly rotation: number | null;
    readonly sourceText: string | null;
  };
  readonly questionId: string | null;
}

export interface SaveCropCommand {
  readonly sourceAssetId: string;
  readonly publicationId: string;
  readonly questionId: string | null;
  readonly pageNumber: number;
  readonly box: NormalizedBox;
  readonly rotation: number | null;
  readonly sourceText: string | null;
  readonly image: Uint8Array;
}

export class CropSourceNotFoundError extends Error {
  constructor(readonly sourceAssetId: string) {
    super("O asset de origem não existe.");
    this.name = "CropSourceNotFoundError";
  }
}

export class CropOwnerNotFoundError extends Error {
  constructor() {
    super("O livro ou a questão não existem, ou não são da biblioteca deste PDF.");
    this.name = "CropOwnerNotFoundError";
  }
}

export async function saveCrop(
  deps: { readonly writer: CropWriter; readonly storage: StorageProvider },
  command: SaveCropCommand,
): Promise<{
  readonly anchorId: string;
  readonly cropAssetId: string;
  readonly sourceAssetId: string;
}> {
  const source = await deps.writer.findSource(command.sourceAssetId);
  if (source === null) throw new CropSourceNotFoundError(command.sourceAssetId);

  // O livro e a questão precisam ser da biblioteca do PDF recortado (#256): a âncora é do livro,
  // e um recorte de um PDF de outra biblioteca levaria para ele um arquivo que não é dele.
  const owner = await deps.writer.resolveOwner({
    workspaceId: source.workspaceId,
    publicationId: command.publicationId,
    questionId: command.questionId,
  });
  if (owner === null) throw new CropOwnerNotFoundError();

  // Antes de qualquer escrita: uma caixa fora da página não deixa nem o arquivo para trás.
  const anchor = normalizeAnchor({
    pageNumber: command.pageNumber,
    box: command.box,
    rotation: command.rotation,
  });

  const stored = await storeAsset(
    {
      workspaceId: source.workspaceId,
      filename: `crop-p${anchor.pageNumber}.png`,
      mimeType: "image/png",
      content: command.image,
      kind: "CROP",
    },
    deps.storage,
  );

  const saved = await deps.writer.persist({
    crop: { ...stored, workspaceId: source.workspaceId },
    anchor: {
      publicationId: command.publicationId,
      sourceAssetId: source.id,
      pageNumber: anchor.pageNumber,
      box: anchor.box,
      rotation: anchor.rotation,
      sourceText: command.sourceText,
    },
    questionId: owner.questionId,
  });

  return { ...saved, sourceAssetId: source.id };
}
