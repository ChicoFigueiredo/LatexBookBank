import type { ScanItem } from "@modules/scan/domain/scan-item";
import type { ScanRunState } from "@modules/scan/domain/scan-run";

import type { FigurePass } from "./figure-pass";
import type { OpenedPdf } from "./pdf-document";
import type { MathPass, SemanticPass, StepProgress } from "./run-scan";
import type { ScanItemChanges, ScanRun, ScanRunPatch } from "./scan-store";

/**
 * O contrato das passadas do scan, depois da proposta montada (ARQ-14 da revisão de 2026-09-23).
 *
 * Antes, cada passada era um bloco copiado no meio do laço: conferir o cancelamento, gravar o
 * estado, reler a execução e os itens, chamar, somar o contador. Uma etapa nova (o gabarito das
 * zonas `skip`, o OCR da página escaneada) exigia editar o laço em cinco pontos. Agora ela é um
 * `ScanPass` a mais na lista, e o laço faz o ritual uma vez para todas.
 */

/** Os contadores que a execução guarda no fim. */
export interface PassCounters {
  readonly figures: number;
  readonly aiCalls: number;
  readonly mathCalls: number;
}

export interface ScanPassContext {
  /** A execução relida depois de gravado o estado da passada. */
  readonly run: ScanRun;
  /** Os itens como estão gravados agora: a passada anterior pode ter mudado algum. */
  readonly items: readonly ScanItem[];
  readonly pdf: OpenedPdf;
  /** O PDF como está no storage: é dele que sai o recorte vetorial. */
  readonly bytes: Uint8Array;
  /** Grava mudanças nos itens e bate o coração da execução. */
  readonly save: (changes: ScanItemChanges) => Promise<void>;
  readonly cancelled: () => Promise<boolean>;
  readonly progress: StepProgress;
}

export interface ScanPassOutcome {
  readonly warnings: readonly string[];
  readonly counters?: Partial<PassCounters>;
}

export interface ScanPass {
  /** O estado que a execução mostra enquanto a passada roda. */
  readonly state: ScanRunState;
  /** O que a execução registra ao entrar na passada: o provedor e o modelo, quando há. */
  readonly provenance?: ScanRunPatch;
  run(context: ScanPassContext): Promise<ScanPassOutcome>;
}

/** O recorte das figuras (D58). */
export const figuresPass = (pass: FigurePass): ScanPass => ({
  state: "CROPPING_FIGURES",
  async run({ run, items, pdf, bytes, save, cancelled, progress }) {
    const result = await pass.run({ run, items, pdf, bytes, save, cancelled, progress });
    return {
      warnings: result.warnings,
      ...(result.saved > 0 ? { counters: { figures: result.saved } } : {}),
    };
  },
});

/** O desempate pela IA (D52): ela devolve só os itens que mudou, e o laço os grava. */
export const semanticReviewPass = (pass: SemanticPass): ScanPass => ({
  state: "SEMANTIC_REVIEW",
  provenance: { aiProviderId: pass.providerId, aiModel: pass.model },
  async run({ run, items, save, cancelled, progress }) {
    const result = await pass.run({ run, items, cancelled, progress });
    if (result.changed.length > 0) await save({ upserts: result.changed, deletedIds: [] });
    return { warnings: result.warnings ?? [], counters: { aiCalls: result.calls } };
  },
});

/** O reconhecimento matemático sob medida (D52, §22). */
export const mathRecognitionPass = (
  pass: MathPass,
  policy: ScanRun["settings"]["recognizeMath"],
): ScanPass => ({
  state: "RECOGNIZING_MATH",
  provenance: { mathProviderId: pass.providerId, mathModel: pass.model },
  async run({ run, items, pdf, save, cancelled, progress }) {
    const result = await pass.run({ run, items, pdf, policy, save, cancelled, progress });
    return { warnings: result.warnings, counters: { mathCalls: result.calls } };
  },
});

/**
 * Uma passada pedida que não tem com o que rodar: vira aviso, no lugar em que ela rodaria — a
 * ordem dos avisos é a ordem das etapas.
 */
export interface UnavailablePass {
  readonly unavailable: string;
}

/** As passadas desta execução, na ordem do §14 do prompt 03: figuras, IA, matemática. */
export function passesFor(
  deps: {
    readonly figures?: FigurePass | null;
    readonly semantic?: SemanticPass | null;
    readonly math?: MathPass | null;
  },
  settings: ScanRun["settings"],
  needsMath: boolean,
): readonly (ScanPass | UnavailablePass)[] {
  const passes: (ScanPass | UnavailablePass)[] = [];

  if (deps.figures) passes.push(figuresPass(deps.figures));

  if (settings.useAi) {
    passes.push(
      deps.semantic
        ? semanticReviewPass(deps.semantic)
        : {
            unavailable:
              "A IA foi pedida, mas não há modelo configurado: a proposta é só determinística.",
          },
    );
  }

  if (settings.recognizeMath !== "never") {
    if (deps.math) passes.push(mathRecognitionPass(deps.math, settings.recognizeMath));
    else if (needsMath) {
      passes.push({
        unavailable:
          "Há itens com matemática e nenhum modelo de visão configurado (`AI_VISION_MODEL`): o LaTeX deles fica para a revisão.",
      });
    }
  }

  return passes;
}
