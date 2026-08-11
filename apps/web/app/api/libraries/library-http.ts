import { NextResponse } from "next/server";

import { InvalidPublicationError } from "@modules/publications/domain/publication-draft";
import { PublicationNotFoundError } from "@modules/publications/application/manage-publications";
import {
  DuplicateLibraryError,
  InvalidLibraryNameError,
  LibraryNotFoundError,
} from "@modules/workspaces/domain/library";

import { BadRequestError, toErrorResponse } from "../tree-http";

/**
 * Erro de domínio para resposta HTTP, no acervo.
 *
 * Cada erro carrega um **código semântico** (§74 do prompt do time): a UI escolhe a mensagem e o
 * campo a marcar a partir dele, sem interpretar texto em português. Nenhum stack trace atravessa.
 *
 * Nome duplicado é **409**, não 400: o pedido está bem formado e seria aceito num acervo onde
 * aquele nome não existisse — o que o recusa é o estado atual.
 */
export function toLibraryErrorResponse(error: unknown): NextResponse {
  if (error instanceof InvalidLibraryNameError) {
    return NextResponse.json(
      { error: "invalid_library_name", message: error.message, field: "name" },
      { status: 400 },
    );
  }

  if (error instanceof DuplicateLibraryError) {
    return NextResponse.json(
      { error: "duplicate_library", message: error.message, field: "name" },
      { status: 409 },
    );
  }

  if (error instanceof LibraryNotFoundError) {
    return NextResponse.json({ error: "library_not_found", message: error.message }, { status: 404 });
  }

  if (error instanceof InvalidPublicationError) {
    return NextResponse.json(
      { error: "invalid_publication", message: error.message, field: error.field },
      { status: 400 },
    );
  }

  if (error instanceof PublicationNotFoundError) {
    return NextResponse.json(
      { error: "publication_not_found", message: error.message },
      { status: 404 },
    );
  }

  if (error instanceof BadRequestError) {
    return NextResponse.json({ error: "bad_request", message: error.message }, { status: 400 });
  }

  return toErrorResponse(error);
}
