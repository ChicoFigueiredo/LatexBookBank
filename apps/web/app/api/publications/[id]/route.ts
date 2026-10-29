import { NextResponse } from "next/server";

import {
  deletePublication,
  updatePublication,
} from "@modules/publications/application/manage-publications";
import { PrismaPublicationRepository } from "@modules/publications/infrastructure/prisma-publication-repository";
import { PrismaLibraryRepository } from "@modules/workspaces/infrastructure/prisma-library-repository";
import { storage } from "@infrastructure/composition";

import { readJson } from "../../http";
import { toErrorResponse } from "../../http";

/** Editar os metadados de um livro já cadastrado. */
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const body = await readJson(request);

    const publication = await updatePublication(
      {
        publications: new PrismaPublicationRepository(),
        libraries: new PrismaLibraryRepository(),
      },
      id,
      body,
      new Date().getFullYear() + 1,
    );

    return NextResponse.json({ publication });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * Excluir o livro.
 *
 * `DELETE` com o título no corpo, como a exclusão de biblioteca: a confirmação é regra de domínio,
 * e não enfeite de tela — uma rota que apaga sem ela seria um caminho por onde o gesto distraído
 * ainda passa.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const body = await readJson(request);
    const removida = await deletePublication(new PrismaPublicationRepository(), storage(), id, {
      title: body["title"],
    });

    return NextResponse.json({ deleted: removida });
  } catch (error) {
    return toErrorResponse(error);
  }
}
