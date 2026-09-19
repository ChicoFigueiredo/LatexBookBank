import { asStorageKey, type StorageProvider } from "@shared/ports/storage-provider";

import { buildLines } from "@modules/scan/domain/page";
import { captureProfile } from "@modules/scan/domain/profiles";
import { buildProposal } from "@modules/scan/domain/structure";
import type { ScanItem } from "@modules/scan/domain/scan-item";
import type { MathRecognitionPolicy } from "@modules/scan/domain/scan-run";

import type { OpenedPdf, PdfDocumentOpener } from "./pdf-document";
import type { FigurePass } from "./figure-pass";
import type { ScanItemChanges, ScanRun, ScanStore } from "./scan-store";

/**
 * O laço do scan (D49): ler página a página gravando o ponto de parada, montar a proposta, e só
 * então chamar IA e reconhecimento — nessa ordem, a do §14 do prompt 03.
 *
 * **Retomar é chamar de novo.** O laço começa na página seguinte à última gravada; a montagem
 * roda sobre as páginas guardadas, sem reabrir o que já foi lido. Cancelar é conferido a cada
 * página e a cada item; o que já foi gravado fica.
 *
 * **Falhar não destrói trabalho** (§63): as páginas lidas continuam gravadas, e a execução fica
 * `FAILED` com a mensagem — retomar recomeça do ponto de parada.
 */

/** Avisa quanto da etapa já foi: a tela mostra, e o aviso serve de batimento. */
export type StepProgress = (done: number, total: number) => Promise<void>;

/** A passada de desempate pela IA (D52). Recebe os itens gravados e devolve só os que mudou. */
export interface SemanticPass {
  readonly providerId: string;
  readonly model: string;
  run(input: {
    readonly run: ScanRun;
    readonly items: readonly ScanItem[];
    readonly cancelled: () => Promise<boolean>;
    readonly progress?: StepProgress;
  }): Promise<{ readonly changed: readonly ScanItem[]; readonly calls: number }>;
}

/** O reconhecimento matemático sob medida (D52, §22). */
export interface MathPass {
  readonly providerId: string;
  readonly model: string;
  run(input: {
    readonly run: ScanRun;
    readonly items: readonly ScanItem[];
    readonly pdf: OpenedPdf;
    readonly policy: MathRecognitionPolicy;
    readonly save: (changes: ScanItemChanges) => Promise<void>;
    readonly cancelled: () => Promise<boolean>;
    readonly progress?: StepProgress;
  }): Promise<{ readonly calls: number; readonly warnings: readonly string[] }>;
}

export interface RunScanDeps {
  readonly store: ScanStore;
  readonly storage: StorageProvider;
  readonly opener: PdfDocumentOpener;
  readonly sourceKey: (assetId: string) => Promise<string | null>;
  readonly semantic?: SemanticPass | null;
  /** O recorte das figuras (D58). Ausente, a proposta traz as figuras sem arquivo. */
  readonly figures?: FigurePass | null;
  readonly math?: MathPass | null;
  readonly now?: () => Date;
}

export async function runScan(deps: RunScanDeps, runId: string): Promise<void> {
  const now = deps.now ?? (() => new Date());
  const { store } = deps;

  const initial = await store.findRun(runId);
  if (!initial) return;
  if (["READY_FOR_REVIEW", "APPROVED", "CANCELLED"].includes(initial.state)) return;

  const profile = captureProfile(initial.profileId);
  const cancelled = async () => (await store.findRun(runId))?.cancelRequested ?? true;
  const stop = async () => {
    await store.updateRun(runId, { state: "CANCELLED", finishedAt: now(), heartbeatAt: now() });
  };

  let pdf: OpenedPdf | null = null;

  try {
    if (!profile) throw new Error(`O perfil ${initial.profileId} não está mais registrado.`);

    await store.updateRun(runId, {
      state: "EXTRACTING",
      error: null,
      startedAt: initial.startedAt ?? now(),
      heartbeatAt: now(),
    });

    const key = await deps.sourceKey(initial.sourceAssetId);
    if (!key) throw new Error("O PDF fonte desta execução não está mais no acervo.");
    const stored = await deps.storage.get(asStorageKey(key));
    pdf = await deps.opener.open(stored.content);

    const lastPage = Math.min(initial.settings.pageTo ?? pdf.pageCount, pdf.pageCount);
    if (initial.pageFrom > lastPage) {
      throw new Error(`O PDF tem ${pdf.pageCount} páginas; o intervalo começa na ${initial.pageFrom}.`);
    }
    if (initial.pageTo !== lastPage) await store.updateRun(runId, { pageTo: lastPage });

    for (let page = Math.max(initial.pageFrom, initial.lastPageRead + 1); page <= lastPage; page++) {
      if (await cancelled()) return await stop();
      await store.savePage(runId, await pdf.readPage(page));
      await store.updateRun(runId, { lastPageRead: page, heartbeatAt: now() });
    }

    if (await cancelled()) return await stop();
    await store.updateRun(runId, { state: "ANALYZING_LAYOUT", heartbeatAt: now() });
    const pages = (await store.loadPages(runId, initial.pageFrom, lastPage)).map(buildLines);

    await store.updateRun(runId, { state: "STRUCTURING", heartbeatAt: now() });
    const proposal = buildProposal(pages, profile);
    await store.replaceItems(runId, proposal.items);

    const progress: StepProgress = async (stepDone, stepTotal) => {
      await store.updateRun(runId, { stepDone, stepTotal, heartbeatAt: now() });
    };

    const warnings = [...proposal.warnings];
    let figures = 0;
    let aiCalls = 0;

    if (deps.figures) {
      if (await cancelled()) return await stop();
      await store.updateRun(runId, { state: "CROPPING_FIGURES", stepDone: 0, stepTotal: 0, heartbeatAt: now() });
      const run = (await store.findRun(runId)) ?? initial;
      const result = await deps.figures.run({
        run,
        items: await store.listItems(runId),
        pdf,
        // Os mesmos bytes que o leitor abriu: o recorte vetorial copia a página de lá.
        bytes: stored.content,
        save: async (changes) => {
          await store.saveItemChanges(runId, changes);
          await store.updateRun(runId, { heartbeatAt: now() });
        },
        cancelled,
        progress,
      });
      warnings.push(...result.warnings);
      if (result.saved > 0) figures = result.saved;
    }
    let mathCalls = 0;

    if (deps.semantic && initial.settings.useAi) {
      if (await cancelled()) return await stop();
      await store.updateRun(runId, {
        state: "SEMANTIC_REVIEW",
        stepDone: 0,
        stepTotal: 0,
        heartbeatAt: now(),
        aiProviderId: deps.semantic.providerId,
        aiModel: deps.semantic.model,
      });
      const run = (await store.findRun(runId)) ?? initial;
      const result = await deps.semantic.run({ run, items: await store.listItems(runId), cancelled, progress });
      aiCalls = result.calls;
      if (result.changed.length > 0) {
        await store.saveItemChanges(runId, { upserts: result.changed, deletedIds: [] });
      }
    } else if (initial.settings.useAi) {
      warnings.push("A IA foi pedida, mas não há modelo configurado: a proposta é só determinística.");
    }

    if (initial.settings.recognizeMath !== "never") {
      if (deps.math) {
        if (await cancelled()) return await stop();
        await store.updateRun(runId, {
          state: "RECOGNIZING_MATH",
          stepDone: 0,
          stepTotal: 0,
          heartbeatAt: now(),
          mathProviderId: deps.math.providerId,
          mathModel: deps.math.model,
        });
        const run = (await store.findRun(runId)) ?? initial;
        const result = await deps.math.run({
          run,
          items: await store.listItems(runId),
          pdf,
          policy: initial.settings.recognizeMath,
          save: async (changes) => {
            await store.saveItemChanges(runId, changes);
            await store.updateRun(runId, { heartbeatAt: now() });
          },
          cancelled,
          progress,
        });
        mathCalls = result.calls;
        warnings.push(...result.warnings);
        if (await cancelled()) return await stop();
      } else if (proposal.items.some((item) => item.needsMath)) {
        warnings.push(
          "Há itens com matemática e nenhum modelo de visão configurado (`AI_VISION_MODEL`): o LaTeX deles fica para a revisão.",
        );
      }
    }

    await store.updateRun(runId, {
      state: "READY_FOR_REVIEW",
      metrics: { ...proposal.metrics, figures },
      warnings,
      pageOffset: proposal.pageOffset,
      aiCalls,
      mathCalls,
      finishedAt: now(),
      heartbeatAt: now(),
    });
  } catch (error) {
    await store.updateRun(runId, {
      state: "FAILED",
      error: error instanceof Error ? error.message : String(error),
      finishedAt: now(),
      heartbeatAt: now(),
    });
  } finally {
    await pdf?.close();
  }
}
