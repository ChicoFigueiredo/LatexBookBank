import { NextResponse } from "next/server";

import { createPublication } from "@modules/publications/application/manage-publications";
import { PrismaPublicationRepository } from "@modules/publications/infrastructure/prisma-publication-repository";
import { PrismaLibraryRepository } from "@modules/workspaces/infrastructure/prisma-library-repository";

import { readJson } from "../../../tree-http";
import { toLibraryErrorResponse } from "../../library-http";

/** Cadastrar um livro dentro de uma biblioteca. */
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ libraryId: string }> },
) {
  const { libraryId } = await params;

  try {
    const body = await readJson(request);

    const publication = await createPublication(
      {
        publications: new PrismaPublicationRepository(),
        libraries: new PrismaLibraryRepository(),
      },
      libraryId,
      body,
      // O relógio é lido **aqui**, na fronteira, e entra no domínio como número. Um domínio que
      // chama `new Date()` é um domínio que só se testa congelando o tempo do processo.
      new Date().getFullYear() + 1,
    );

    return NextResponse.json({ publication }, { status: 201 });
  } catch (error) {
    return toLibraryErrorResponse(error);
  }
}
