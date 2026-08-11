import { NextResponse } from "next/server";

import { updatePublication } from "@modules/publications/application/manage-publications";
import { PrismaPublicationRepository } from "@modules/publications/infrastructure/prisma-publication-repository";
import { PrismaLibraryRepository } from "@modules/workspaces/infrastructure/prisma-library-repository";

import { readJson } from "../../tree-http";
import { toLibraryErrorResponse } from "../../libraries/library-http";

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
    return toLibraryErrorResponse(error);
  }
}
