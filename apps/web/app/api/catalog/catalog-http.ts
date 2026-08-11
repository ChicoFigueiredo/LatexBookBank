import { NextResponse } from "next/server";

import {
  CatalogEntryNotFoundError,
  DuplicatePublicationError,
} from "@modules/publications/application/import-from-catalog";
import { CatalogFileMissingError, CatalogUnavailableError } from "@/shared/ports/library-catalog";

import { BadRequestError } from "../tree-http";
import { toLibraryErrorResponse } from "../libraries/library-http";

/**
 * O caminho da biblioteca, conferido antes de virar leitura de disco.
 *
 * **A entrada é do usuário e vira acesso ao filesystem** — é a superfície mais perigosa deste
 * módulo (§75). Três recusas:
 *
 * - vazio ou não-texto;
 * - caminho relativo, que dependeria do diretório de trabalho do servidor e resolveria para
 *   lugares diferentes conforme quem subiu a aplicação;
 * - `\0`, que trunca o caminho dentro do syscall e faz `/etc/passwd\0.db` virar `/etc/passwd`.
 *
 * O que **não** é recusado aqui: `..`. Ele é normalizado pelo `path.resolve` do adaptador, e é lá
 * que a conferência de "continua dentro da raiz" acontece para cada arquivo lido — que é o lugar
 * certo, porque a raiz é justamente o que esta função está recebendo.
 */
export function parseCatalogPath(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new BadRequestError("Informe a pasta da biblioteca Calibre.");
  }
  if (value.includes("\0")) {
    throw new BadRequestError("Caminho inválido.");
  }

  const caminho = value.trim();
  // Windows (`C:\...`), POSIX (`/mnt/...`) e UNC (`\\servidor\...`). Um caminho relativo não é
  // recusado por ser perigoso — é recusado por ser ambíguo.
  if (!/^([a-zA-Z]:[\\/]|\/|\\\\)/.test(caminho)) {
    throw new BadRequestError("Use o caminho completo da pasta, não um caminho relativo.");
  }

  return caminho;
}

/** Erro de catálogo para resposta HTTP, com código semântico (§74). */
export function toCatalogErrorResponse(error: unknown): NextResponse {
  if (error instanceof CatalogUnavailableError) {
    return NextResponse.json(
      { error: "catalog_unavailable", message: error.message },
      { status: 422 },
    );
  }
  if (error instanceof CatalogFileMissingError) {
    return NextResponse.json({ error: "source_missing", message: error.message }, { status: 422 });
  }
  if (error instanceof CatalogEntryNotFoundError) {
    return NextResponse.json(
      { error: "catalog_entry_not_found", message: error.message },
      { status: 404 },
    );
  }
  if (error instanceof DuplicatePublicationError) {
    // 409, e com o id do que já existe: a tela precisa poder oferecer "abrir o que já está lá"
    // em vez de só recusar.
    return NextResponse.json(
      {
        error: "duplicate_publication",
        message: error.message,
        signal: error.signal,
        publicationId: error.publicationId,
      },
      { status: 409 },
    );
  }

  return toLibraryErrorResponse(error);
}
