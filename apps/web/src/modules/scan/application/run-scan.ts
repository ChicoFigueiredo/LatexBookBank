import { asStorageKey, type StorageProvider } from "@shared/ports/storage-provider";

import { buildLines } from "@modules/scan/domain/page";
import { captureProfile, rankProfiles, PROFILE_MISMATCH_MARGIN } from "@modules/scan/domain/profiles";
import { inheritReview } from "@modules/scan/domain/inherit-review";
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
      Trocar de perfil não joga fora a revisão (ADR 0009).

      Acontece aqui, logo depois de os itens existirem, porque casar âncoras exige os dois lados
      gravados. O que atravessa é só decisão de gente — aceitar, rejeitar, corrigir texto —, e
      nunca o estado que a máquina produziu, que a varredura nova acabou de produzir de novo.
    */
    if (initial.inheritedFromRunId !== null) {
      const anteriores = await store.listItems(initial.inheritedFromRunId);
      const novos = await store.listItems(runId);
      const herdados = inheritReview(anteriores, novos);
      if (herdados.length > 0) {
        const porId = new Map(novos.map((item) => [item.id, item]));
        await store.saveItemChanges(runId, {
          upserts: herdados.flatMap((decisao) => {
            const item = porId.get(decisao.id);
            return item
              ? [
                  {
                    ...item,
                    reviewState: decisao.reviewState,
                    reviewedText: decisao.reviewedText,
                    reviewedLatex: decisao.reviewedLatex,
                  },
                ]
              : [];
          }),
          deletedIds: [],
        });
      }
      warnings.push(
        `Trocou de perfil: ${herdados.length} de ${anteriores.length} itens revisados foram reaproveitados pela posição no livro. Confira antes de aprovar.`,
      );
    }

    /*
      O perfil escolhido foi o errado? (ADR 0007)

      As páginas já estão lidas e os perfis já sabem se pontuar — a mesma nota que sugere antes
      da varredura acusa depois dela. O sintoma que motivou isto é mudo por natureza: varrer um
      livro com o perfil errado não dá erro nenhum, dá 453 seções onde deviam existir vinte.
    */
    const ranking = rankProfiles(pages);
    const melhor = ranking[0];
    const escolhido = ranking.find((entry) => entry.id === profile.id);
    if (melhor && escolhido && melhor.id !== profile.id && melhor.score - escolhido.score > PROFILE_MISMATCH_MARGIN) {
      /*
        O aviso lidera pelo que é certo — este perfil reconheceu pouco — e só depois nomeia o
        candidato. A ordem importa: o alarme acerta sempre que dispara, e o palpite de qual seria
        o perfil certo pode errar num livro para o qual ainda não existe perfil nenhum.
      */
      warnings.push(
        `O perfil "${profile.label}" reconheceu pouco deste PDF (${escolhido.evidence}). O que mais se parece com ele é "${melhor.label}" (${melhor.evidence}) — confira a proposta antes de aprovar.`,
      );
    }
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
      warnings.push(...(result.warnings ?? []));
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
