import { NextResponse } from "next/server";

import { PrismaPublicationRepository } from "@modules/publications/infrastructure/prisma-publication-repository";

import { toErrorResponse } from "../../../tree-http";

/**
 * O que a exclusão de um livro levaria junto.
 *
 * Separado do resumo da estante de propósito, e pela mesma razão que a biblioteca tem a sua: a
 * listagem carrega uma contagem de questões por livro, e pendurar nela a contagem de recortes e
 * arquivos faria a estante pagar três consultas por linha para mostrar um número que só o diálogo
 * de exclusão usa.
 */
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const contents = await new PrismaPublicationRepository().contentsOf(id);
    if (contents === null) {
      return NextResponse.json({ error: "not_found", message: "Livro não encontrado." }, { status: 404 });
    }

    return NextResponse.json({ contents });
  } catch (error) {
    return toErrorResponse(error);
  }
}
