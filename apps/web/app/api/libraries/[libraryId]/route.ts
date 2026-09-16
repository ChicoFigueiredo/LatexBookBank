import { NextResponse } from "next/server";

import { LibraryNotFoundError } from "@modules/workspaces/domain/library";
import { deleteLibrary, renameLibrary } from "@modules/workspaces/application/manage-libraries";
import { PrismaLibraryRepository } from "@modules/workspaces/infrastructure/prisma-library-repository";
import { LocalFileStorageProvider } from "@infrastructure/storage/local/local-file-storage-provider";
import { env as appEnv } from "@/shared/config/env";

import { readJson } from "../../tree-http";
import { toLibraryErrorResponse } from "../library-http";

/** Uma biblioteca — o que ela tem dentro, renomear e excluir. */
export const dynamic = "force-dynamic";

/**
 * O que a exclusão levaria junto.
 *
 * Separado do `GET /api/libraries` de propósito: a listagem carrega uma contagem por biblioteca, e
 * pendurar nela a contagem de questões e arquivos faria a Home pagar três consultas por card para
 * mostrar um número que só o diálogo de exclusão usa.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ libraryId: string }> }) {
  const { libraryId } = await params;
  const repository = new PrismaLibraryRepository();

  try {
    const library = await repository.findById(libraryId);
    if (!library) throw new LibraryNotFoundError(libraryId);

    const contents = await repository.contentsOf(libraryId);
    return NextResponse.json({ library, contents });
  } catch (error) {
    return toLibraryErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ libraryId: string }> },
) {
  const { libraryId } = await params;

  try {
    const body = await readJson(request);
    const library = await renameLibrary(new PrismaLibraryRepository(), libraryId, body["name"]);

    return NextResponse.json({ library });
  } catch (error) {
    return toLibraryErrorResponse(error);
  }
}

/**
 * Excluir, de vez.
 *
 * O nome digitado vai no corpo, e o caso de uso o confere contra o nome real. A trava é repetida
 * aqui — o diálogo já a aplica — porque a rota é chamável sem passar pela tela, e "apagou a
 * biblioteca errada" não tem desfazer.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ libraryId: string }> },
) {
  const { libraryId } = await params;

  try {
    const body = await readJson(request);
    const deleted = await deleteLibrary(
      new PrismaLibraryRepository(),
      new LocalFileStorageProvider({ rootDir: appEnv().storageRoot }),
      libraryId,
      { name: body["name"] },
    );

    return NextResponse.json({ deleted });
  } catch (error) {
    return toLibraryErrorResponse(error);
  }
}
