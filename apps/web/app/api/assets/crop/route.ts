import { NextResponse } from "next/server";

import { storeAsset } from "@modules/assets/application/store-asset";
import { InvalidAnchorError, normalizeAnchor } from "@modules/assets/domain/source-anchor";
import {
  attachAnchorToQuestion,
  createAnchor,
  createAsset,
  findAsset,
} from "@modules/assets/infrastructure/prisma-asset-writer";
import { LocalFileStorageProvider } from "@infrastructure/storage/local/local-file-storage-provider";
import { env as appEnv } from "@/shared/config/env";

import { BadRequestError, toErrorResponse } from "../../tree-http";

/**
 * Salva um recorte: cria a âncora e o `Asset(CROP)`, **sem tocar na fonte**.
 *
 * O recorte chega pronto do cliente. O visualizador já rasteriza a página com `pdf.js` para
 * mostrá-la, e recortar o que está na tela custa uma chamada de canvas — enquanto rasterizar de
 * novo no servidor custaria um processo por recorte, para produzir a mesma imagem que o usuário
 * está vendo.
 *
 * O que **não** vem do cliente é a coordenada em pixels: sobe a caixa normalizada (D28). A imagem
 * é conveniência; a âncora é o dado.
 *
 * O `SOURCE_PDF` nunca é substituído (D29): o crop é um asset **novo**, e a âncora aponta para os
 * dois. Voltar à origem continua possível porque a origem continua lá.
 *
 * Ver spec §18 · D28 · D29 · issue #123.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const form = await request.formData().catch(() => null);
    if (form === null) throw new BadRequestError("Envie como `multipart/form-data`.");

    const image = form.get("image");
    if (!(image instanceof File)) throw new BadRequestError("O campo `image` é obrigatório.");

    const sourceAssetId = requireText(form.get("sourceAssetId"), "sourceAssetId");
    const publicationId = requireText(form.get("publicationId"), "publicationId");

    const source = await findAsset(sourceAssetId);
    if (source === null) {
      return NextResponse.json(
        { error: "source_not_found", message: "O asset de origem não existe." },
        { status: 404 },
      );
    }

    const anchor = normalizeAnchor({
      pageNumber: Number(form.get("pageNumber")),
      box: {
        x: Number(form.get("x")),
        y: Number(form.get("y")),
        width: Number(form.get("width")),
        height: Number(form.get("height")),
      },
      rotation: form.get("rotation") === null ? null : Number(form.get("rotation")),
    });

    const stored = await storeAsset(
      {
        workspaceId: source.workspaceId,
        filename: `crop-p${anchor.pageNumber}.png`,
        mimeType: "image/png",
        content: new Uint8Array(await image.arrayBuffer()),
        kind: "CROP",
      },
      new LocalFileStorageProvider({ rootDir: appEnv().storageRoot }),
    );

    const cropAsset = await createAsset({ ...stored, workspaceId: source.workspaceId });

    const created = await createAnchor({
      publicationId,
      sourceAssetId: source.id,
      pageNumber: anchor.pageNumber,
      box: anchor.box,
      rotation: anchor.rotation,
      cropAssetId: cropAsset.id,
      sourceText: asOptionalText(form.get("sourceText")),
    });

    const questionId = form.get("questionId");
    if (typeof questionId === "string" && questionId !== "") {
      await attachAnchorToQuestion(questionId, created.id);
    }

    return NextResponse.json(
      { anchorId: created.id, cropAssetId: cropAsset.id, sourceAssetId: source.id },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof InvalidAnchorError) {
      return NextResponse.json(
        { error: "invalid_anchor", message: error.message },
        { status: 400 },
      );
    }
    return toErrorResponse(error);
  }
}

function requireText(value: FormDataEntryValue | null, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new BadRequestError(`O campo \`${field}\` é obrigatório.`);
  }
  return value;
}

const asOptionalText = (value: FormDataEntryValue | null): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.slice(0, 20_000) : null;
