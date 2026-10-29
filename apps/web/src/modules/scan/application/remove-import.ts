import { isInProgress } from "../domain/scan-run";
import { bodyPieceLatex } from "../domain/approval-latex";
import { planImportRemoval, type ImportedNode, type ImportRemovalPlan } from "../domain/import-removal";
// O mesmo erro do resto do scan: uma execução que não existe é 404 em qualquer rota, e dois tipos
// com o mesmo nome dariam dois caminhos para a mesma resposta.
import { ScanRunNotFoundError, ScanRunStateError } from "./control-scan";
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

/** Os itens cujos trechos a execução acrescentou a um nó que ela não criou, e as âncoras deles. */
export interface AppendedPieces {
  readonly nodeId: string;
  readonly itemKeys: readonly string[];
  readonly anchorIds: readonly string[];
}

/** O que sai de um nó que fica de pé: o texto de cada trecho, e as âncoras. */
export interface DetachedPieces {
  readonly nodeId: string;
  readonly pieces: readonly string[];
  readonly anchorIds: readonly string[];
}

/** Os nós que uma execução criou, e o gesto de mandá-los para a lixeira. */
export interface ScanImportStore {
  listCreatedNodes(runId: string): Promise<readonly ImportedNode[]>;
  sendToTrash(nodeIds: readonly string[]): Promise<void>;
  /** O que a execução acrescentou a nós que ela não criou — o capítulo reaproveitado (#249). */
  listAppendedPieces(runId: string): Promise<readonly AppendedPieces[]>;
  detachPieces(entries: readonly DetachedPieces[]): Promise<void>;
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
  /** Quantos nós que já existiam perdem o texto que esta execução lhes acrescentou (#249). */
  readonly detached: number;
}

const labelOf = (node: ImportedNode): string =>
  node.title ?? (node.originalLabel ? `${node.kind} ${node.originalLabel}` : node.kind);

export async function previewImportRemoval(deps: RemoveImportDeps, runId: string): Promise<ImportPreview> {
  const run = await deps.store.findRun(runId);
  if (!run) throw new ScanRunNotFoundError(runId);

  const nodes = await deps.imports.listCreatedNodes(runId);
  const plan = planImportRemoval(nodes);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const appended = await deps.imports.listAppendedPieces(runId);

  return {
    ...plan,
    runId,
    created: nodes.length,
    detached: appended.length,
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
  readonly figures: number;
  /** Quantos nós que já existiam perderam o texto que a execução lhes acrescentou. */
  readonly detached: number;
}

/*
  O texto que a execução pôs num nó que ela não criou (#249, CAP-09).

  O nó reaproveitado fica de pé — não foi a importação que o criou (ADR 0006) —, mas o corpo que
  ela lhe acrescentou, e as âncoras, saem: senão a reimportação marcava o conteúdo novo como "já
  no acervo", e o corpo velho ficava. O texto de cada trecho é refeito do item, como a aprovação
  o fez; por isso sai antes de a execução ser apagada.
*/
async function piecesToDetach(deps: RemoveImportDeps, runId: string): Promise<DetachedPieces[]> {
  const appended = await deps.imports.listAppendedPieces(runId);
  if (appended.length === 0) return [];
  const items = new Map((await deps.store.listItems(runId)).map((item) => [item.key, item]));
  return appended.map((entry) => ({
    nodeId: entry.nodeId,
    anchorIds: entry.anchorIds,
    pieces: entry.itemKeys.flatMap((key) => {
      const item = items.get(key);
      return item ? [bodyPieceLatex(item)] : [];
    }),
  }));
}

export async function removeImport(
  deps: RemoveImportDeps,
  input: { readonly runId: string; readonly scope: RemovalScope },
): Promise<RemovalResult> {
  const run = await deps.store.findRun(input.runId);
  if (!run) throw new ScanRunNotFoundError(input.runId);

  if (isInProgress(run.state)) {
    // Apagar debaixo de um laço que está escrevendo deixa a execução gravando numa linha que não
    // existe mais. Cancelar primeiro é um gesto que a tela já tem.
    throw new ScanRunStateError("Esta varredura ainda está andando: cancele antes de apagar.");
  }

  if (input.scope === "proposal") {
    /*
      Apagar só a proposta de uma execução **já aprovada** cegaria o acervo: os nós continuariam
      com o id dela, e não haveria mais execução para achá-los. A importação ficaria para sempre,
      sem caminho de volta — e a tela promete o contrário.
    */
    const created = await deps.imports.listCreatedNodes(input.runId);
    if (created.length > 0) {
      throw new ScanRunStateError(
        `Esta varredura já criou ${created.length} nós no acervo. Apague a importação inteira, ou deixe-a como está: sem a execução, o que ela criou não pode mais ser desfeito.`,
      );
    }
    await deps.store.deleteRun(input.runId);
    return { scope: "proposal", trashed: 0, kept: 0, counts: {}, figures: 0, detached: 0 };
  }

  const plan = planImportRemoval(await deps.imports.listCreatedNodes(input.runId));
  const detached = await piecesToDetach(deps, input.runId);

  /*
    A lixeira primeiro, a execução depois.

    Se o processo cair entre as duas, o que sobra é uma execução cujo acervo já foi para a
    lixeira — visível, com o botão ali para terminar o serviço. A ordem inversa deixaria nós
    órfãos sem nenhum caminho de volta até eles.
  */
  await deps.imports.sendToTrash(plan.trash);
  await deps.imports.detachPieces(detached);
  await deps.store.deleteRun(input.runId);

  return {
    scope: "import",
    trashed: plan.trash.length,
    kept: plan.keptCount,
    counts: plan.counts,
    figures: plan.figures,
    detached: detached.length,
  };
}
