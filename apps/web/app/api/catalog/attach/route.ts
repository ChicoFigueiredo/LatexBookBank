import { NextResponse } from "next/server";

import { attachFromCatalog } from "@modules/publications/application/attach-from-catalog";
import { CalibreCatalogProvider } from "@modules/publications/infrastructure/calibre-catalog-provider";
import {
  PrismaCatalogAssetWriter,
  PrismaPublicationSourceWriter,
} from "@modules/publications/infrastructure/prisma-catalog-import";
import { PrismaPublicationRepository } from "@modules/publications/infrastructure/prisma-publication-repository";

import { BadRequestError, readJson } from "../../tree-http";
import { parseCatalogPath, toCatalogErrorResponse } from "../catalog-http";

/**
 * **Anexar** o PDF de um livro do catálogo a uma publicação que já existe (D44).
 *
 * O irmão de `import/route.ts` pelo lado de quem já tem o livro cadastrado. A diferença de forma é
 * só uma: aqui não há `libraryId`, porque a publicação já sabe de que biblioteca é — pedir os dois
 * abriria a possibilidade de discordarem, e o cliente não é a autoridade sobre isso.
 *
 * `200` e não `201`: nada é criado do ponto de vista de quem pediu — um livro que existia ganhou
 * uma fonte.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await readJson(request);

    const publicationId = typeof body["publicationId"] === "string" ? body["publicationId"] : "";
    if (publicationId === "") throw new BadRequestError("Informe o livro que recebe o PDF.");

    const result = await attachFromCatalog(
      {
        catalog: new CalibreCatalogProvider(parseCatalogPath(body["path"])),
        publications: new PrismaPublicationRepository(),
        assets: new PrismaCatalogAssetWriter(),
        source: new PrismaPublicationSourceWriter(),
      },
      {
        publicationId,
        externalId: String(body["externalId"] ?? ""),
        ...(Array.isArray(body["formats"])
          ? { formats: body["formats"].filter((item): item is string => typeof item === "string") }
          : {}),
        // As duas confirmações da tela: trocar a fonte que já existe, e preencher campo vazio.
        // Ausentes, o servidor não faz nem uma nem outra — é o padrão que não surpreende.
        replace: body["replace"] === true,
        fillMetadata: body["fillMetadata"] === true,
        // O relógio é lido aqui, na fronteira, e entra no domínio como valor.
        maxYear: new Date().getFullYear() + 1,
      },
    );

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return toCatalogErrorResponse(error);
  }
}
