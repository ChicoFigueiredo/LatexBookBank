import { NextResponse } from "next/server";

import { createLibrary } from "@modules/workspaces/application/manage-libraries";
import { PrismaLibraryRepository } from "@modules/workspaces/infrastructure/prisma-library-repository";

import { readJson } from "../tree-http";
import { toLibraryErrorResponse } from "./library-http";

/**
 * As bibliotecas do acervo — listar e criar.
 *
 * Rota nova, ao lado de `/api/workspaces`, que continua servindo só ao backup: aquela devolve id e
 * slug para o serviço saber o que exportar, esta devolve o que a Home precisa mostrar. Fundir as
 * duas faria o backup carregar contagens que ele descarta.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const libraries = await new PrismaLibraryRepository().list();
  return NextResponse.json({ libraries });
}

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const library = await createLibrary(new PrismaLibraryRepository(), { name: body["name"] });

    return NextResponse.json({ library }, { status: 201 });
  } catch (error) {
    return toLibraryErrorResponse(error);
  }
}
