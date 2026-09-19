import { captureProfile } from "@modules/scan/domain/profiles";
import { applyReview, InvalidReviewError, type ReviewOperation } from "@modules/scan/domain/review";
import type { ScanItem } from "@modules/scan/domain/scan-item";
import { isReviewable } from "@modules/scan/domain/scan-run";

import { ScanRunNotFoundError, ScanRunStateError } from "./control-scan";
import type { OpenedPdf, PdfDocumentOpener } from "./pdf-document";
import type { FigurePass } from "./figure-pass";
import type { MathPass, SemanticPass } from "./run-scan";
import type { ScanStore } from "./scan-store";

/**
 * Revisar a proposta (Fase 7 do prompt 03, §36): uma operação por vez, gravada inteira ou nada, e
 * devolvendo só os itens que mudaram — a tela troca esses e mantém o resto.
 */

async function reviewable(store: ScanStore, runId: string) {
  const run = await store.findRun(runId);
  if (!run) throw new ScanRunNotFoundError(runId);
  if (!isReviewable(run.state)) {
    throw new ScanRunStateError("A proposta ainda está sendo montada; espere a execução terminar.");
  }
  const profile = captureProfile(run.profileId);
  if (!profile) throw new ScanRunStateError(`O perfil ${run.profileId} não está mais registrado.`);
  return { run, profile };
}

export async function reviewScan(
  deps: { readonly store: ScanStore; readonly newId: () => string },
  runId: string,
  operation: ReviewOperation,
): Promise<{ readonly changed: readonly ScanItem[]; readonly deletedIds: readonly string[] }> {
  const { profile } = await reviewable(deps.store, runId);
  const items = await deps.store.listItems(runId);
  const result = applyReview(items, operation, profile, deps.newId);
  if (result.upserts.length > 0 || result.deletedIds.length > 0) {
    await deps.store.saveItemChanges(runId, result);
  }
  return { changed: result.upserts, deletedIds: result.deletedIds };
}

/**
 * Reprocessar um item: pedir de novo o desempate à IA, ou o reconhecimento matemático das âncoras
 * como estão agora. O resultado entra na proposta; o item volta para revisão.
 */
export async function reprocessItem(
  deps: {
    readonly store: ScanStore;
    readonly opener: PdfDocumentOpener;
    readonly readSource: (assetId: string) => Promise<Uint8Array | null>;
    readonly semantic: SemanticPass | null;
    readonly math: MathPass | null;
    readonly figures?: FigurePass | null;
  },
  runId: string,
  itemId: string,
  what: "ai" | "math" | "figure",
): Promise<ScanItem> {
  const { run } = await reviewable(deps.store, runId);
  const items = await deps.store.listItems(runId);
  const item = items.find((candidate) => candidate.id === itemId);
  if (!item) throw new InvalidReviewError("Item da proposta não encontrado.");
  if (item.documentNodeId) throw new InvalidReviewError("Este item já está no acervo; corrija-o no editor.");

  if (what === "ai") {
    if (!deps.semantic) throw new ScanRunStateError("Não há modelo de IA configurado (`AI_BASE_URL`, `AI_MODEL`).");
    // Reprocessar é pedido explícito: o item vai ao modelo mesmo que a confiança seja alta.
    const doubtful = { ...item, confidence: 0 };
    const context = items.map((candidate) => (candidate.id === itemId ? doubtful : candidate));
    const { changed } = await deps.semantic.run({ run, items: context, cancelled: async () => false });
    const updated = changed.find((candidate) => candidate.id === itemId);
    if (!updated) throw new ScanRunStateError("A IA não devolveu uma decisão válida para este item.");
    const merged = { ...updated, confidence: item.confidence, confidenceParts: updated.confidenceParts };
    await deps.store.saveItemChanges(runId, { upserts: [merged], deletedIds: [] });
    await deps.store.updateRun(runId, {
      aiCalls: run.aiCalls + 1,
      aiProviderId: deps.semantic.providerId,
      aiModel: deps.semantic.model,
    });
    return merged;
  }

  /*
    Recortar de novo (D58): a caixa da figura mudou na revisão, e o arquivo gravado é o da caixa
    velha. O `figureAsset` é limpo antes de chamar a passada — é ele que faz a passada pular o que
    já tem arquivo, e sem isso o pedido explícito não faria nada.
  */
  if (what === "figure") {
    if (!deps.figures) throw new ScanRunStateError("O recorte de figuras não está disponível nesta execução.");
    const bytes = await deps.readSource(run.sourceAssetId);
    if (!bytes) throw new ScanRunStateError("O PDF fonte desta execução não está mais no acervo.");

    const { figureAsset: _asset, figureScreenAsset: _screen, figureLatexName: _name, ...metadata } = item.metadata;
    const pending = { ...item, metadata };

    let pdf: OpenedPdf | null = null;
    let cropped: ScanItem | null = null;
    try {
      pdf = await deps.opener.open(bytes);
      const result = await deps.figures.run({
        run,
        items: [pending],
        pdf,
        bytes,
        save: async (changes) => {
          const upserted = changes.upserts[0];
          if (upserted) {
            cropped = upserted;
            await deps.store.saveItemChanges(runId, { upserts: [upserted], deletedIds: [] });
          }
        },
        cancelled: async () => false,
      });
      if (!cropped) throw new ScanRunStateError(result.warnings[0] ?? "O recorte não gerou arquivo.");
      return cropped;
    } finally {
      await pdf?.close();
    }
  }

  if (!deps.math) throw new ScanRunStateError("Não há modelo de visão configurado (`AI_VISION_MODEL`).");
  const bytes = await deps.readSource(run.sourceAssetId);
  if (!bytes) throw new ScanRunStateError("O PDF fonte desta execução não está mais no acervo.");

  let pdf: OpenedPdf | null = null;
  let saved: ScanItem | null = null;
  try {
    pdf = await deps.opener.open(bytes);
    const result = await deps.math.run({
      run,
      items: [{ ...item, mathResult: null, reviewState: item.reviewState }],
      pdf,
      policy: "always",
      save: async (changes) => {
        const upserted = changes.upserts[0];
        if (upserted) {
          saved = { ...upserted, reviewState: upserted.reviewState === "AUTO_ACCEPTABLE" ? "NEEDS_REVIEW" : upserted.reviewState };
          await deps.store.saveItemChanges(runId, { upserts: [saved], deletedIds: [] });
        }
      },
      cancelled: async () => false,
    });
    await deps.store.updateRun(runId, {
      mathCalls: run.mathCalls + result.calls,
      mathProviderId: deps.math.providerId,
      mathModel: deps.math.model,
    });
    if (!saved) throw new ScanRunStateError(result.warnings[0] ?? "O reconhecimento não devolveu resultado.");
    return saved;
  } finally {
    await pdf?.close();
  }
}
