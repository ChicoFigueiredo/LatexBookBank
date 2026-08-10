import { NextResponse } from "next/server";

import { UploadRejectedError } from "@modules/assets/domain/asset-ingestion";
import { inferKind, storeAsset } from "@modules/assets/application/store-asset";
import { isAssetKind } from "@modules/assets/domain/asset-kind";
import { createAsset } from "@modules/assets/infrastructure/prisma-asset-writer";
import { LocalFileStorageProvider } from "@infrastructure/storage/local/local-file-storage-provider";
import { env as appEnv } from "@/shared/config/env";
import { StorageKeyEscapeError } from "@/shared/ports";

import { BadRequestError, toErrorResponse } from "../tree-http";

/**
 * Sobe um arquivo.
 *
 * `multipart/form-data`, porque é o que file picker, drag-and-drop e `Ctrl+V` produzem sem
 * conversão — os três gestos da spec §10 chegam aqui pelo mesmo caminho.
 *
 * O `workspaceId` vem do corpo e **não** é opcional: a chave de storage é prefixada por ele, e um
 * upload sem workspace não teria onde morar sem escapar do isolamento.
 *
 * Ver spec §10 · issue #123.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const form = await request.formData().catch(() => null);
    if (form === null) throw new BadRequestError("Envie o arquivo como `multipart/form-data`.");

    const file = form.get("file");
    if (!(file instanceof File)) throw new BadRequestError("O campo `file` é obrigatório.");

    const workspaceId = form.get("workspaceId");
    if (typeof workspaceId !== "string" || workspaceId.trim() === "") {
      throw new BadRequestError("O campo `workspaceId` é obrigatório.");
    }

    const declaredKind = form.get("kind");
    const kind =
      typeof declaredKind === "string" && isAssetKind(declaredKind)
        ? declaredKind
        : inferKind(file.type, file.name);

    const record = await storeAsset(
      {
        workspaceId,
        filename: file.name,
        mimeType: file.type,
        content: new Uint8Array(await file.arrayBuffer()),
        kind,
      },
      new LocalFileStorageProvider({ rootDir: appEnv().storageRoot }),
    );

    const questionId = form.get("questionId");
    const asset = await createAsset({
      ...record,
      workspaceId,
      questionId: typeof questionId === "string" && questionId !== "" ? questionId : null,
    });

    return NextResponse.json({ id: asset.id, ...record }, { status: 201 });
  } catch (error) {
    if (error instanceof UploadRejectedError) {
      return NextResponse.json(
        { error: `upload_${error.reason}`, message: error.message },
        { status: 415 },
      );
    }
    if (error instanceof StorageKeyEscapeError) {
      // A tentativa foi barrada pelo provider — mas devolvê-la como 500 esconderia uma recusa de
      // isolamento dentro de um erro genérico, e quem chamou não saberia que o `workspaceId` é
      // que estava errado. Recusa de entrada é 400.
      return NextResponse.json(
        {
          error: "invalid_workspace",
          message:
            "`workspaceId` inválido: ele vira segmento de caminho e não pode conter `/` nem `..`.",
        },
        { status: 400 },
      );
    }
    return toErrorResponse(error);
  }
}
