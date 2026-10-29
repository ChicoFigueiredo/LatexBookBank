import type {
  DeletedNodeRecord,
  DocumentTreeRepository,
  DocumentTreeWriter,
  NewNode,
  PlannedNode,
  TreeNodeRecord,
} from "@modules/document-tree/domain/document-tree-repository";
import type { NodeKind } from "@modules/document-tree/domain/node-kind";

/**
 * A árvore em memória: o dublê das portas de leitura e escrita da árvore.
 *
 * Não é atalho para evitar o banco: é a demonstração do critério arquitetural da auditoria §47 —
 * o use case não sabe onde executa. E para o dublê não divergir do adaptador (TST-05), o mesmo
 * contrato roda contra os dois em `tree-contract.test.ts`.
 */

export interface InMemoryRow {
  id: string;
  publicationId: string;
  parentId: string | null;
  kind: NodeKind;
  title: string | null;
  sortKey: string;
  deletedAt: Date | null;
}

export class InMemoryTree implements DocumentTreeRepository, DocumentTreeWriter {
  private rows: InMemoryRow[] = [];
  private sequence = 0;

  /**
   * Um relógio que anda um minuto a cada exclusão: cada ato tem o seu instante, como no banco,
   * e é só assim que "excluído antes" se distingue de "excluído junto" (#260, TST-08).
   */
  private clock = Date.parse("2026-08-07T18:00:00.000Z");

  constructor(seed: readonly Omit<InMemoryRow, "deletedAt">[] = []) {
    this.rows = seed.map((row) => ({ ...row, deletedAt: null }));
  }

  snapshot(): readonly InMemoryRow[] {
    return this.rows.map((row) => ({ ...row }));
  }

  async listByPublication(publicationId: string): Promise<readonly TreeNodeRecord[]> {
    return this.rows
      .filter((row) => row.publicationId === publicationId && row.deletedAt === null)
      .sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0))
      .map((row) => ({
        id: row.id,
        parentId: row.parentId,
        kind: row.kind,
        title: row.title,
        sortKey: row.sortKey,
        numberingStyle: "ARABIC" as const,
        originalLabel: null,
        question: null,
      }));
  }

  async create(node: NewNode): Promise<string> {
    const id = `novo-${++this.sequence}`;
    this.rows.push({
      id,
      publicationId: node.publicationId,
      parentId: node.parentId,
      kind: node.kind,
      title: node.title,
      sortKey: node.sortKey,
      deletedAt: null,
    });
    return id;
  }

  async rename(nodeId: string, title: string | null): Promise<void> {
    const row = this.rows.find((r) => r.id === nodeId);
    if (row) row.title = title;
  }

  async move(nodeId: string, parentId: string | null, sortKey: string): Promise<void> {
    const row = this.rows.find((r) => r.id === nodeId);
    if (row) {
      row.parentId = parentId;
      row.sortKey = sortKey;
    }
  }

  async softDeleteMany(nodeIds: readonly string[]): Promise<void> {
    const now = new Date((this.clock += 60_000));
    for (const row of this.rows) if (nodeIds.includes(row.id)) row.deletedAt = now;
  }

  async restoreMany(
    nodeIds: readonly string[],
    reposition?: { readonly nodeId: string; readonly sortKey: string },
  ): Promise<void> {
    for (const row of this.rows) {
      if (nodeIds.includes(row.id)) row.deletedAt = null;
      if (reposition && row.id === reposition.nodeId) row.sortKey = reposition.sortKey;
    }
  }

  async duplicateSubtree(publicationId: string, plan: readonly PlannedNode[]): Promise<string> {
    const idMap = new Map<string, string>();

    for (const [index, step] of plan.entries()) {
      const source = this.rows.find((r) => r.id === step.sourceId);
      const id = `copia-${++this.sequence}`;
      // A raiz da cópia entra sob um nó que já existe; as demais, sob a cópia do próprio pai.
      const parentId =
        index === 0 || step.parentId === null ? step.parentId : (idMap.get(step.parentId) ?? null);
      // Como o adaptador: só a raiz leva o "(cópia)".
      const title = source?.title ?? null;
      this.rows.push({
        id,
        publicationId,
        parentId,
        kind: source?.kind ?? "SECTION",
        title: index === 0 && title ? `${title} (cópia)` : title,
        sortKey: step.sortKey,
        deletedAt: null,
      });
      idMap.set(step.sourceId, id);
    }

    return idMap.get(plan[0]?.sourceId ?? "") as string;
  }

  async listDeleted(publicationId: string): Promise<readonly DeletedNodeRecord[]> {
    return this.rows
      .filter((row) => row.publicationId === publicationId && row.deletedAt !== null)
      .sort((a, b) => (b.deletedAt as Date).getTime() - (a.deletedAt as Date).getTime())
      .map((row) => ({
        id: row.id,
        parentId: row.parentId,
        title: row.title,
        kind: row.kind,
        sortKey: row.sortKey,
        deletedAt: row.deletedAt as Date,
      }));
  }
}
