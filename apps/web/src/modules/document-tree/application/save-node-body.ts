import { ConcurrencyConflictError } from "@/shared/ports/repository";

import {
  canHaveBody,
  InvalidNodeBodyError,
  parseBody,
  type NodeBodySnapshot,
} from "@modules/document-tree/domain/node-body";
import type { NodeKind } from "@modules/document-tree/domain/node-kind";
import { NodeNotFoundError } from "@modules/document-tree/domain/tree-mutations";

/**
 * Salvar o corpo de um nó com a mesma disciplina da questão (spec §42): conflito nunca sobrescreve
 * em silêncio, autosave sem mudança não grava, e cada gravação deixa o estado anterior no
 * histórico.
 */

export interface NodeBodyRecord {
  readonly nodeId: string;
  readonly publicationId: string;
  readonly kind: NodeKind;
  readonly title: string | null;
  readonly bodyLatex: string;
  readonly updatedAt: Date;
}

export interface NodeBodyRepository {
  find(publicationId: string, nodeId: string): Promise<NodeBodyRecord | null>;
  /** Grava o corpo e a revisão do estado anterior na mesma transação; devolve o registro novo. */
  save(input: {
    readonly nodeId: string;
    readonly bodyLatex: string;
    readonly previous: NodeBodySnapshot;
    readonly summary: string;
  }): Promise<NodeBodyRecord>;
}

export async function saveNodeBody(
  repository: NodeBodyRepository,
  command: {
    readonly publicationId: string;
    readonly nodeId: string;
    readonly expectedUpdatedAt: Date;
    readonly bodyLatex: unknown;
  },
): Promise<{ readonly record: NodeBodyRecord; readonly written: boolean }> {
  const bodyLatex = parseBody(command.bodyLatex);
  const current = await repository.find(command.publicationId, command.nodeId);
  if (!current) throw new NodeNotFoundError(command.nodeId);
  if (!canHaveBody(current.kind)) {
    throw new InvalidNodeBodyError("Questão não tem corpo: o texto dela mora no enunciado.");
  }

  if (current.updatedAt.getTime() !== command.expectedUpdatedAt.getTime()) {
    throw new ConcurrencyConflictError(
      "DocumentNode",
      command.nodeId,
      command.expectedUpdatedAt.toISOString(),
      current.updatedAt.toISOString(),
    );
  }

  if (bodyLatex === current.bodyLatex) return { record: current, written: false };

  const record = await repository.save({
    nodeId: command.nodeId,
    bodyLatex,
    previous: { title: current.title, bodyLatex: current.bodyLatex },
    summary: current.bodyLatex === "" ? "corpo criado" : "corpo editado",
  });
  return { record, written: true };
}
