import { planImportRemoval, type ImportedNode, type ImportRemovalPlan } from "../domain/import-removal";
// O mesmo erro do resto do scan: uma execução que não existe é 404 em qualquer rota, e dois tipos
// com o mesmo nome dariam dois caminhos para a mesma resposta.
import { ScanRunNotFoundError } from "./control-scan";
import type { ScanStore } from "./scan-store";

/**
 * Reimportar (D57, ADR 0006): apagar o que uma execução deixou, para varrer o livro de novo.
 *
 * Duas coisas podem ser apagadas, e a diferença importa:
 *
 * - `proposal` — só a varredura: páginas lidas e proposta. O acervo não é tocado. É o "recomeçar
 *   a análise" de quem mudou o perfil e quer ver o resultado novo.
 * - `import` — a varredura **e** o que ela criou no acervo. O que foi criado vai para a lixeira,
 *   e o que foi editado à mão depois da aprovação fica de pé, com o motivo escrito.
 *
 * O plano é calculado no domínio e conferido antes por quem aperta o botão: a confirmação mostra
 * os números, e é por isso que `preview` e `remove` partem do mesmo cálculo.
 */

export type RemovalScope = "proposal" | "import";

/** Os nós que uma execução criou, e o gesto de mandá-los para a lixeira. */
export interface ScanImportStore {
  listCreatedNodes(runId: string): Promise<readonly ImportedNode[]>;
  sendToTrash(nodeIds: readonly string[]): Promise<void>;
}

export interface RemoveImportDeps {
  readonly store: ScanStore;
  readonly imports: ScanImportStore;
}

export interface ImportPreview extends ImportRemovalPlan {
  readonly runId: string;
  /** Quantos nós a execução criou ao todo — o que vai somado ao que fica. */
  readonly created: number;
  /** Os preservados com o que a tela mostra: nome e motivo. */
  readonly keptRows: readonly { readonly id: string; readonly label: string; readonly reason: string }[];
}

const labelOf = (node: ImportedNode): string =>
  node.title ?? (node.originalLabel ? `${node.kind} ${node.originalLabel}` : node.kind);

export async function previewImportRemoval(deps: RemoveImportDeps, runId: string): Promise<ImportPreview> {
  const run = await deps.store.findRun(runId);
  if (!run) throw new ScanRunNotFoundError(runId);

  const nodes = await deps.imports.listCreatedNodes(runId);
  const plan = planImportRemoval(nodes);
  const byId = new Map(nodes.map((node) => [node.id, node]));

  return {
    ...plan,
    runId,
    created: nodes.length,
    keptRows: plan.kept.map((kept) => ({
      id: kept.id,
      label: labelOf(byId.get(kept.id)!),
      reason: kept.reason,
    })),
  };
}

export interface RemovalResult {
  readonly scope: RemovalScope;
  /** Quantos nós foram para a lixeira. */
  readonly trashed: number;
  readonly kept: number;
  readonly counts: Readonly<Record<string, number>>;
}

export async function removeImport(
  deps: RemoveImportDeps,
  input: { readonly runId: string; readonly scope: RemovalScope },
): Promise<RemovalResult> {
  const run = await deps.store.findRun(input.runId);
  if (!run) throw new ScanRunNotFoundError(input.runId);

  if (input.scope === "proposal") {
    await deps.store.deleteRun(input.runId);
    return { scope: "proposal", trashed: 0, kept: 0, counts: {} };
  }

  const plan = planImportRemoval(await deps.imports.listCreatedNodes(input.runId));

  /*
    A lixeira primeiro, a execução depois.

    Se o processo cair entre as duas, o que sobra é uma execução cujo acervo já foi para a
    lixeira — visível, com o botão ali para terminar o serviço. A ordem inversa deixaria nós
    órfãos sem nenhum caminho de volta até eles.
  */
  await deps.imports.sendToTrash(plan.trash);
  await deps.store.deleteRun(input.runId);

  return { scope: "import", trashed: plan.trash.length, kept: plan.keptCount, counts: plan.counts };
}
