"use client";

import type {
  AttachFromCatalogResponse,
  BrowseCatalogResponse,
  DuplicatePublicationBody,
  ImportBatchResponse,
  ImportFromCatalogResponse,
} from "@modules/publications/application/catalog-contract";
import { readReply, type JsonReply } from "@/shared/http/api-client";

/**
 * As quatro rotas do catálogo (Calibre), tipadas pelo contrato que elas mesmas anotam.
 *
 * Cada função devolve a resposta lida (`JsonReply`) e a tela decide: a duplicata e a troca de
 * fonte são 409 que viram **escolha**, não erro, e só ela sabe qual pergunta fazer.
 */

const post = <T>(url: string, body: unknown): Promise<JsonReply<T>> =>
  readReply<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

/** `formats` só viaja quando a pessoa mexeu no controle: o padrão (só PDF) é do backend. */
const withFormats = (formats: readonly string[] | undefined) => (formats ? { formats } : {});

export const catalogApi = {
  browse: (input: { readonly path: string; readonly libraryId: string; readonly query: string }) =>
    post<BrowseCatalogResponse>("/api/catalog", input),

  importOne: (input: {
    readonly path: string;
    readonly libraryId: string;
    readonly externalId: string;
    readonly force: boolean;
    readonly formats?: readonly string[] | undefined;
  }) =>
    post<ImportFromCatalogResponse & Pick<DuplicatePublicationBody, "publicationId">>(
      "/api/catalog/import",
      {
        path: input.path,
        libraryId: input.libraryId,
        externalId: input.externalId,
        force: input.force,
        ...withFormats(input.formats),
      },
    ),

  importBatch: (input: {
    readonly path: string;
    readonly libraryId: string;
    readonly externalIds: readonly string[];
    readonly formats?: readonly string[] | undefined;
  }) =>
    post<ImportBatchResponse>("/api/catalog/import-batch", {
      path: input.path,
      libraryId: input.libraryId,
      externalIds: input.externalIds,
      ...withFormats(input.formats),
    }),

  attach: (input: {
    readonly path: string;
    readonly publicationId: string;
    readonly externalId: string;
    readonly replace: boolean;
    readonly fillMetadata: boolean;
    readonly formats?: readonly string[] | undefined;
  }) =>
    post<AttachFromCatalogResponse>("/api/catalog/attach", {
      path: input.path,
      publicationId: input.publicationId,
      externalId: input.externalId,
      replace: input.replace,
      fillMetadata: input.fillMetadata,
      ...withFormats(input.formats),
    }),
};
