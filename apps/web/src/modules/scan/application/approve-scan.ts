import {
  planApproval,
  type ApprovalPlan,
  type ExistingAnchor,
  type ExistingNode,
} from "@modules/scan/domain/approval-plan";
import type { CaptureProfile } from "@modules/scan/domain/capture-profile";
import { captureProfile } from "@modules/scan/domain/profiles";
import type { ScanItem } from "@modules/scan/domain/scan-item";

import { ScanRunNotFoundError, ScanRunStateError } from "./control-scan";
import type { ScanRun, ScanStore } from "./scan-store";

/**
 * Aprovar a proposta (Fase 8 do prompt 03 · D45, D53): o único caminho da proposta para o acervo.
 *
 * O plano é calculado no domínio com a árvore que já existe; a gravação é uma transação só — nós,
 * questões `DRAFT`, âncoras, ligações, corpo das seções e a marca em cada item. Falhou no meio,
 * nada entrou. Aprovar de novo não duplica: o que já entrou está marcado, e o que coincide com o
 * acervo fica *já no acervo*.
 */

export interface ApprovalContext {
  readonly nodes: readonly ExistingNode[];
  readonly anchors: readonly ExistingAnchor[];
}

export interface ApprovalSummary {
  readonly createdNodes: number;
  readonly createdQuestions: number;
  readonly reusedNodes: number;
  readonly bodyAppends: number;
  readonly anchors: number;
  readonly alreadyInCollection: number;
  readonly materializedItems: number;
}

export interface ScanApprovalWriter {
  readContext(publicationId: string, sourceAssetId: string): Promise<ApprovalContext>;
  execute(input: {
    readonly run: ScanRun;
    readonly profile: CaptureProfile;
    readonly plan: ApprovalPlan;
    readonly items: readonly ScanItem[];
    readonly now: Date;
  }): Promise<ApprovalSummary>;
}

export class DestinationNotInPublicationError extends Error {
  constructor() {
    super("O destino escolhido não é um nó deste livro.");
    this.name = "DestinationNotInPublicationError";
  }
}

export async function approveScan(
  deps: { readonly store: ScanStore; readonly writer: ScanApprovalWriter; readonly now?: () => Date },
  command: { readonly runId: string; readonly destinationId: string | null; readonly includeSuggested: boolean },
): Promise<{ readonly summary: ApprovalSummary; readonly skipped: ApprovalPlan["skipped"] }> {
  const run = await deps.store.findRun(command.runId);
  if (!run) throw new ScanRunNotFoundError(command.runId);
  if (run.state !== "READY_FOR_REVIEW" && run.state !== "APPROVED") {
    throw new ScanRunStateError("Só uma proposta pronta pode ser aprovada.");
  }
  const profile = captureProfile(run.profileId);
  if (!profile) throw new ScanRunStateError(`O perfil ${run.profileId} não está mais registrado.`);

  const [items, context] = await Promise.all([
    deps.store.listItems(run.id),
    deps.writer.readContext(run.publicationId, run.sourceAssetId),
  ]);

  if (command.destinationId && !context.nodes.some((node) => node.id === command.destinationId)) {
    throw new DestinationNotInPublicationError();
  }

  const plan = planApproval({
    items,
    profile,
    destinationId: command.destinationId,
    includeSuggested: command.includeSuggested,
    existingNodes: context.nodes,
    existingAnchors: context.anchors,
  });

  const summary =
    plan.steps.length === 0
      ? { createdNodes: 0, createdQuestions: 0, reusedNodes: 0, bodyAppends: 0, anchors: 0, alreadyInCollection: 0, materializedItems: 0 }
      : await deps.writer.execute({ run, profile, plan, items, now: deps.now?.() ?? new Date() });

  return { summary, skipped: plan.skipped };
}
