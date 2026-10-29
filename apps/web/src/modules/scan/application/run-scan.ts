import { asStorageKey, type StorageProvider } from "@shared/ports/storage-provider";

import { buildLines } from "@modules/scan/domain/page";
import { captureProfile } from "@modules/scan/domain/profiles";
import { applyInheritedReview } from "@modules/scan/domain/inherit-review";
import { buildProposal } from "@modules/scan/domain/structure";
import type { ScanItem } from "@modules/scan/domain/scan-item";
import type { MathRecognitionPolicy } from "@modules/scan/domain/scan-run";

import type { OpenedPdf, PdfDocumentOpener } from "./pdf-document";
import type { FigurePass } from "./figure-pass";
import { passesFor, type PassCounters } from "./scan-pass";
import type { ScanItemChanges, ScanRun, ScanStore } from "./scan-store";
import { profileMismatchWarning } from "./suggest-profile";

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
    /** Avisos que a passada devolve sem falhar — o silêncio era o pior desfecho (ADR 0008). */
  }): Promise<{ readonly changed: readonly ScanItem[]; readonly calls: number; readonly warnings?: readonly string[] }>;
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
    /*
      Perfil que saiu do registro não é falha da varredura (ADR 0008).

      `FAILED` seria o pior desfecho possível: `startScan` recusa reabrir execução que falhou,
      então pedir de novo criaria outra do zero e as páginas já lidas iriam embora — e o perfil
      costuma voltar, porque o caso comum é renomear, não remover. À espera, a chave continua
      valendo e retomar recomeça na página seguinte à última lida.
    */
    if (!profile) {
      await store.updateRun(runId, {
        state: "AWAITING_PROFILE",
        error: `O perfil ${initial.profileId} não está mais registrado: a varredura fica à espera dele.`,
        heartbeatAt: now(),
      });
      return;
    }

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

    /*
      Trocar de perfil não joga fora a revisão (`domain/inherit-review.ts`).

      Acontece aqui, logo depois de os itens existirem, porque casar âncoras exige os dois lados
      gravados. O que atravessa é só decisão de gente — aceitar, rejeitar, corrigir texto —, e
      nunca o estado que a máquina produziu, que a varredura nova acabou de produzir de novo.
    */
    if (initial.inheritedFromRunId !== null) {
      const anteriores = await store.listItems(initial.inheritedFromRunId);
      const herdados = applyInheritedReview(anteriores, await store.listItems(runId));
      if (herdados.length > 0) await store.saveItemChanges(runId, { upserts: [...herdados], deletedIds: [] });
      warnings.push(
        `Trocou de perfil: ${herdados.length} de ${anteriores.length} itens revisados foram reaproveitados pela posição no livro. Confira antes de aprovar.`,
      );
    }

    // O perfil escolhido foi o errado? (ADR 0007) A mesma amostra que sugere antes acusa depois.
    const mismatch = profileMismatchWarning(pages, profile);
    if (mismatch) warnings.push(mismatch);

    /*
      As passadas, em ordem e com o mesmo ritual (ARQ-14): conferir o cancelamento, mostrar o
      estado, reler a execução e os itens que a anterior pode ter mudado, rodar, e conferir o
      cancelamento de novo — quem pede para parar no meio de uma passada termina com o que ela já
      gravou, em qualquer uma delas.
    */
    let counters: PassCounters = { figures: 0, aiCalls: 0, mathCalls: 0 };
    const save = async (changes: ScanItemChanges) => {
      await store.saveItemChanges(runId, changes);
      await store.updateRun(runId, { heartbeatAt: now() });
    };

    for (const pass of passesFor(deps, initial.settings, proposal.items.some((item) => item.needsMath))) {
      if ("unavailable" in pass) {
        warnings.push(pass.unavailable);
        continue;
      }
      if (await cancelled()) return await stop();
      await store.updateRun(runId, {
        state: pass.state,
        stepDone: 0,
        stepTotal: 0,
        heartbeatAt: now(),
        ...pass.provenance,
      });
      const outcome = await pass.run({
        run: (await store.findRun(runId)) ?? initial,
        items: await store.listItems(runId),
        pdf,
        // Os mesmos bytes que o leitor abriu: o recorte vetorial copia a página de lá.
        bytes: stored.content,
        save,
        cancelled,
        progress,
      });
      warnings.push(...outcome.warnings);
      counters = { ...counters, ...outcome.counters };
      if (await cancelled()) return await stop();
    }

    await store.updateRun(runId, {
      state: "READY_FOR_REVIEW",
      metrics: { ...proposal.metrics, figures: counters.figures },
      warnings,
      pageOffset: proposal.pageOffset,
      aiCalls: counters.aiCalls,
      mathCalls: counters.mathCalls,
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
