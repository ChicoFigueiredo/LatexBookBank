import { NextResponse } from "next/server";

import { browseCatalog } from "@modules/publications/application/import-from-catalog";
import { CalibreCatalogProvider } from "@modules/publications/infrastructure/calibre-catalog-provider";
import { existingPublicationsOf } from "@modules/publications/infrastructure/prisma-catalog-import";

import { readJson } from "../tree-http";
import { parseCatalogPath, toCatalogErrorResponse } from "./catalog-http";

/**
 * Abre um catálogo Calibre e lista o que há dentro.
 *
 * `POST` e não `GET` porque o caminho da biblioteca vai no corpo: ele é um caminho de disco do
 * usuário, e caminho de disco em query string acaba em log de acesso, em histórico do navegador e
 * na barra de endereço de quem estiver olhando por cima do ombro.
 *
 * A resposta traz o **sinal de duplicata** por livro: ver "já está no acervo" antes de clicar
 * poupa a viagem inteira (design §17).
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await readJson(request);

    const root = parseCatalogPath(body["path"]);
    const libraryId = typeof body["libraryId"] === "string" ? body["libraryId"] : "";
    const query = typeof body["query"] === "string" ? body["query"] : "";

    const catalog = new CalibreCatalogProvider(root);
    const summary = await catalog.describe();

    const existing = libraryId === "" ? [] : await existingPublicationsOf(libraryId);
    const entries = await browseCatalog(catalog, existing, query);

    return NextResponse.json({ summary, entries });
  } catch (error) {
    return toCatalogErrorResponse(error);
  }
}
