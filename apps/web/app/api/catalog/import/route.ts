import { NextResponse } from "next/server";

import { importFromCatalog } from "@modules/publications/application/import-from-catalog";
import { CalibreCatalogProvider } from "@modules/publications/infrastructure/calibre-catalog-provider";
import {
  existingPublicationsOf,
  PrismaCatalogAssetWriter,
  PrismaPublicationOriginWriter,
} from "@modules/publications/infrastructure/prisma-catalog-import";
import { PrismaPublicationRepository } from "@modules/publications/infrastructure/prisma-publication-repository";
import { PrismaLibraryRepository } from "@modules/workspaces/infrastructure/prisma-library-repository";
import type { ImportFromCatalogResponse } from "@modules/publications/application/catalog-contract";

import { readJson } from "../../http";
import { resolveCatalogRoot } from "../catalog-http";
import { toErrorResponse } from "../../http";

/** Importa um livro do catálogo para uma biblioteca do acervo. */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await readJson(request);

    const result = await importFromCatalog(
      {
        catalog: new CalibreCatalogProvider(await resolveCatalogRoot(body["path"])),
        libraries: new PrismaLibraryRepository(),
        publications: new PrismaPublicationRepository(),
        assets: new PrismaCatalogAssetWriter(),
        origin: new PrismaPublicationOriginWriter(),
        existing: existingPublicationsOf,
      },
      {
        libraryId: String(body["libraryId"] ?? ""),
        externalId: String(body["externalId"] ?? ""),
        ...(Array.isArray(body["formats"])
          ? { formats: body["formats"].filter((item): item is string => typeof item === "string") }
          : {}),
        force: body["force"] === true,
        // O relógio é lido aqui, na fronteira, e entra no domínio como valor.
        maxYear: new Date().getFullYear() + 1,
        now: new Date(),
      },
    );

    return NextResponse.json(result satisfies ImportFromCatalogResponse, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
