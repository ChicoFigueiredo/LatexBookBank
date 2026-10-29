import { NextResponse } from "next/server";

import { assetLatexName } from "@modules/assets/domain/asset-latex-name";

import { registerUploadedAsset } from "@modules/assets/application/register-uploaded-asset";
import { inferKind, storeAsset } from "@modules/assets/application/store-asset";
import { isAssetKind } from "@modules/assets/domain/asset-kind";
import { PrismaAssetWriter } from "@modules/assets/infrastructure/prisma-asset-writer";
import { storage } from "@infrastructure/composition";
import { resolveAssetOwner } from "@/shared/authorization/asset-owner-scope";
import type { UploadAssetResponse } from "@modules/assets/application/asset-contract";

import { BadRequestError, toErrorResponse } from "../http";

/**
 * Sobe um arquivo.
 *
 * `multipart/form-data`, porque é o que file picker, drag-and-drop e `Ctrl+V` produzem sem
 * conversão — os três gestos da spec §10 chegam aqui pelo mesmo caminho.
 *
 * A biblioteca é **resolvida no servidor** (#256): a chave de storage é prefixada por ela, e um
 * upload sem biblioteca não teria onde morar sem escapar do isolamento. Quando o livro vem, ela sai
 * dele, e o `workspaceId` do formulário, se vier, precisa concordar; sem livro, o `workspaceId` é
 * obrigatório e precisa existir. Livro, biblioteca ou questão que não batem viram 404 **antes** de
 * um byte ir para o storage.
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

    const publicationId = optionalText(form.get("publicationId"));
    const claimedWorkspace = optionalText(form.get("workspaceId"));
    if (publicationId === null && claimedWorkspace === null) {
      throw new BadRequestError(
        "Informe o livro (`publicationId`) ou a biblioteca (`workspaceId`).",
      );
    }

    // O livro de onde o upload partiu. Opcional na rota — `/api/assets` é o upload do produto
    // inteiro — mas é ele que decide se este PDF vira o PDF fonte do livro. A regra mora no
    // `registerUploadedAsset`; aqui se confere que livro, biblioteca e questão são um só dono.
    const owner = await resolveAssetOwner({
      workspaceId: claimedWorkspace,
      publicationId,
      questionId: optionalText(form.get("questionId")),
    });
    if (owner === null) {
      return NextResponse.json(
        {
          error: "owner_not_found",
          message: "O livro, a biblioteca ou a questão não existem, ou não são do mesmo dono.",
        },
        { status: 404 },
      );
    }
    const { workspaceId } = owner;

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
      storage(),
    );

    const asset = await registerUploadedAsset(
      { assets: new PrismaAssetWriter() },
      {
        record,
        workspaceId,
        questionId: owner.questionId,
        publicationId: owner.publicationId,
      },
    );

    // Projeção campo a campo, e **não** `...record`: o `StoredAssetRecord` carrega a
    // `storageKey`, e o espalhamento a mandava para o browser em toda resposta de upload. A D26 diz
    // que a chave é opaca e do servidor — quem precisa dos bytes pede por `assetId`, e é o servidor
    // que resolve. Um espalhamento é confortável hoje e vaza o campo que alguém acrescentar amanhã.
    return NextResponse.json(
      {
        id: asset.id,
        // O `latexName` é o que o `\includegraphics` cita, e é calculado aqui pelo mesmo módulo
        // que a rota de render usa para nomear o arquivo no diretório do job (#173).
        latexName: assetLatexName(record),
        sha256: record.sha256,
        sizeBytes: record.sizeBytes,
        mimeType: record.mimeType,
        originalFilename: record.originalFilename,
        kind: record.kind,
        width: record.width,
        height: record.height,
        // A tela precisa saber que o livro deixou de estar sem fonte: é o que dispara a
        // revalidação, para o resumo não continuar mostrando a pendência já resolvida.
        becameBookSource: asset.becameBookSource,
      } satisfies UploadAssetResponse,
      { status: 201 },
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}

const optionalText = (value: FormDataEntryValue | null): string | null =>
  typeof value === "string" && value.trim() !== "" ? value : null;
