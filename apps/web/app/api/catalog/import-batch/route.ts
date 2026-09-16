import { NextResponse } from "next/server";

import { importManyFromCatalog } from "@modules/publications/application/import-from-catalog";
import { CalibreCatalogProvider } from "@modules/publications/infrastructure/calibre-catalog-provider";
import {
  existingPublicationsOf,
  PrismaCatalogAssetWriter,
  PrismaPublicationOriginWriter,
} from "@modules/publications/infrastructure/prisma-catalog-import";
import { PrismaPublicationRepository } from "@modules/publications/infrastructure/prisma-publication-repository";
import { PrismaLibraryRepository } from "@modules/workspaces/infrastructure/prisma-library-repository";

import { BadRequestError, readJson } from "../../tree-http";
import { parseCatalogPath, toCatalogErrorResponse } from "../catalog-http";

/**
 * Importa vários livros do catálogo de uma vez (beta-editorial.md, "o que o Calibre ainda não
 * faz" — "não há importação em lote").
 *
 * Um livro que falha não derruba a resposta: o corpo devolve 201 com o relatório por livro, e a
 * tela decide o que mostrar de cada um — a resposta 4xx/5xx fica só para o que impede o lote
 * inteiro de começar (pasta inválida, catálogo fora do ar).
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await readJson(request);

    const externalIds = body["externalIds"];
    if (!Array.isArray(externalIds) || externalIds.some((item) => typeof item !== "string")) {
      throw new BadRequestError("Informe `externalIds` como lista de strings.");
    }

    const report = await importManyFromCatalog(
      {
        catalog: new CalibreCatalogProvider(parseCatalogPath(body["path"])),
        libraries: new PrismaLibraryRepository(),
        publications: new PrismaPublicationRepository(),
        assets: new PrismaCatalogAssetWriter(),
        origin: new PrismaPublicationOriginWriter(),
        existing: existingPublicationsOf,
      },
      {
        libraryId: String(body["libraryId"] ?? ""),
        externalIds: externalIds as readonly string[],
        ...(Array.isArray(body["formats"])
          ? { formats: body["formats"].filter((item): item is string => typeof item === "string") }
          : {}),
        force: body["force"] === true,
        maxYear: new Date().getFullYear() + 1,
        now: new Date(),
      },
    );

    return NextResponse.json(report, { status: 201 });
  } catch (error) {
    return toCatalogErrorResponse(error);
  }
}
