import { NextResponse } from "next/server";

import { DeletedAncestorError } from "@modules/document-tree/application/mutate-tree";
import { NODE_KINDS, type NodeKind } from "@modules/document-tree/domain/node-kind";
import { CyclicMoveError, NodeNotFoundError } from "@modules/document-tree/domain/tree-mutations";
import type { Placement } from "@modules/document-tree/domain/tree-mutations";

/**
 * Tradução entre HTTP e domínio para as rotas da árvore.
 *
 * Validação escrita à mão, sem Zod. Não é preguiça: a superfície aqui são três campos de
 * vocabulário fechado, e Zod entra na Fase 9, onde `QuestionPatch` tem schema versionado e
 * whitelist de campos — lá a dependência se paga. Trazê-la agora só para checar três strings
 * seria abstração cerimonial, que a auditoria §47 pede para evitar.
 */

export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new BadRequestError("O corpo precisa ser um objeto JSON.");
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof BadRequestError) throw error;
    throw new BadRequestError("Corpo JSON inválido.");
  }
}

export function parseNodeKind(value: unknown): NodeKind {
  if (typeof value === "string" && (NODE_KINDS as readonly string[]).includes(value)) {
    return value as NodeKind;
  }
  throw new BadRequestError(`\`kind\` precisa ser um de: ${NODE_KINDS.join(", ")}.`);
}

/** `null` é título ausente e é legítimo — questão importada usa o rótulo original do livro. */
export function parseTitle(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new BadRequestError("`title` precisa ser texto ou nulo.");

  const trimmed = value.trim();
  if (trimmed.length > 500) throw new BadRequestError("`title` passa de 500 caracteres.");
  return trimmed === "" ? null : trimmed;
}

export function parsePlacement(value: unknown): Placement {
  if (typeof value !== "object" || value === null) {
    throw new BadRequestError("`placement` é obrigatório.");
  }
  const raw = value as Record<string, unknown>;

  switch (raw["kind"]) {
    case "firstChild":
    case "lastChild": {
      const parentId = raw["parentId"];
      if (parentId !== null && typeof parentId !== "string") {
        throw new BadRequestError("`placement.parentId` precisa ser id ou null (raiz).");
      }
      return { kind: raw["kind"], parentId };
    }
    case "before":
    case "after": {
      const siblingId = raw["siblingId"];
      if (typeof siblingId !== "string" || siblingId === "") {
        throw new BadRequestError("`placement.siblingId` é obrigatório.");
      }
      return { kind: raw["kind"], siblingId };
    }
    default:
      throw new BadRequestError(
        "`placement.kind` precisa ser firstChild, lastChild, before ou after.",
      );
  }
}

/**
 * Traduz erro de domínio em status HTTP.
 *
 * Ciclo é **409 Conflict**, não 400: o pedido está bem formado e seria válido em outra árvore —
 * o que o recusa é o estado atual. A distinção importa para o cliente, que trata 400 como "meu
 * código está errado" e 409 como "mostre isso ao usuário".
 */
export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof BadRequestError) {
    return NextResponse.json({ error: "bad_request", message: error.message }, { status: 400 });
  }
  if (error instanceof NodeNotFoundError) {
    return NextResponse.json({ error: "not_found", message: error.message }, { status: 404 });
  }
  if (error instanceof CyclicMoveError || error instanceof DeletedAncestorError) {
    return NextResponse.json({ error: "conflict", message: error.message }, { status: 409 });
  }
  throw error;
}
