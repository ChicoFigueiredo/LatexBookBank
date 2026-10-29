import { NODE_KINDS, type NodeKind } from "@modules/document-tree/domain/node-kind";
import type { Placement } from "@modules/document-tree/domain/tree-mutations";

import { BadRequestError } from "./http";

/**
 * O vocabulário da árvore no corpo do pedido: tipo de nó, título e posição.
 *
 * Separado de `http.ts`, que é de todas as rotas: estas três funções só servem a quem cria, move
 * ou duplica nó, e o resto do app não precisa depender do domínio da árvore para ler um JSON.
 */

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
