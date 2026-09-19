import { z } from "zod";

import type { AiProvider } from "@shared/ports/ai-provider";

import { captureProfile } from "@modules/scan/domain/profiles";
import { combineConfidence, isScanKind, type ScanKind } from "@modules/scan/domain/proposal";
import type { ScanItem } from "@modules/scan/domain/scan-item";

import type { SemanticPass } from "./run-scan";

/**
 * A IA como desempate (Fase 5 do prompt 03, D52).
 *
 * Só os itens duvidosos vão ao modelo, em lotes, com a estrutura em volta e os tipos permitidos —
 * nunca o livro. A resposta passa por Zod e pelo `canContain` do perfil antes de tocar a proposta;
 * o que não passa é ignorado, não "corrigido". E o item que a IA tocou volta para revisão: a IA
 * propõe, a pessoa aprova (§38, §63 "nenhum output de IA entra no acervo sem revisão").
 */

const decisionsSchema = z.object({
  decisions: z.array(
    z.object({
      key: z.string(),
      kind: z.string(),
      confidence: z.number().min(0).max(1),
      reason: z.string().max(500).default(""),
    }),
  ),
});

/** Abaixo disto, o item é duvidoso e vai à IA. */
const DOUBT_THRESHOLD = 0.75;
const BATCH_SIZE = 8;
/** Tipos que a IA pode trocar. Título numerado e questão de prova têm evidência forte demais. */
const RECLASSIFIABLE: ReadonlySet<ScanKind> = new Set(["CONTENT", "EXAMPLE", "EXERCISE", "NOTE", "SECTION", "SUBSECTION"]);

/** O primeiro objeto JSON da resposta — modelo local às vezes cerca com ```json. */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

export function createSemanticPass(provider: AiProvider, model: string, now: () => Date = () => new Date()): SemanticPass {
  return {
    providerId: provider.id,
    model,
    async run({ run, items, cancelled, progress }) {
      const profile = captureProfile(run.profileId);
      if (!profile) return { changed: [], calls: 0 };

      const byKey = new Map(items.map((item) => [item.key, item]));
      const doubtful = items.filter(
        (item) =>
          item.reviewState !== "APPROVED" &&
          item.reviewState !== "REJECTED" &&
          item.confidence < DOUBT_THRESHOLD &&
          RECLASSIFIABLE.has(item.kind),
      );

      const changed: ScanItem[] = [];
      let calls = 0;
      const batches = Math.ceil(doubtful.length / BATCH_SIZE);
      await progress?.(0, batches);

      for (let start = 0; start < doubtful.length; start += BATCH_SIZE) {
        if (await cancelled()) break;
        if (start > 0) await progress?.(start / BATCH_SIZE, batches);
        const batch = doubtful.slice(start, start + BATCH_SIZE);
        const firstOrder = batch[0]?.sortOrder ?? 0;
        const previousStructure = items
          .filter((item) => item.sortOrder < firstOrder && item.kind !== "CONTENT")
          .slice(-12)
          .map((item) => ({ kind: item.kind, label: item.originalLabel, title: item.title }));

        const prompt = profile.buildSemanticPrompt({
          profile: { id: profile.id, label: profile.label },
          previousStructure,
          allowedKinds: profile.kinds,
          candidates: batch.map((item) => ({
            key: item.key,
            kind: item.kind,
            text: item.text,
            confidence: item.confidence,
            reasons: item.evidence,
          })),
        });

        calls++;
        let parsed: z.infer<typeof decisionsSchema> | null = null;
        try {
          const result = await provider.run({
            model,
            messages: [{ role: "user", content: prompt }],
            temperature: 0,
          });
          const validation = decisionsSchema.safeParse(extractJson(result.text));
          parsed = validation.success ? validation.data : null;
        } catch {
          // Falha do modelo não derruba o scan: a proposta determinística continua valendo.
          parsed = null;
        }
        if (!parsed) continue;

        for (const decision of parsed.decisions) {
          const item = batch.find((candidate) => candidate.key === decision.key);
          if (!item || !isScanKind(decision.kind) || !profile.kinds.includes(decision.kind)) continue;
          const parentKind = item.parentKey ? (byKey.get(item.parentKey)?.kind ?? null) : null;
          if (!profile.canContain(parentKind, decision.kind)) continue;

          const confidenceParts = { ...item.confidenceParts, semantic: decision.confidence };
          changed.push({
            ...item,
            kind: decision.kind,
            confidenceParts,
            confidence: combineConfidence(confidenceParts),
            evidence: [...item.evidence, `IA: ${decision.reason || "sem justificativa"}`],
            reviewState: "NEEDS_REVIEW",
            aiDecision: {
              previousKind: item.kind,
              kind: decision.kind,
              confidence: decision.confidence,
              reason: decision.reason,
              providerId: provider.id,
              model,
              decidedAt: now().toISOString(),
            },
          });
        }
      }

      await progress?.(batches, batches);
      return { changed, calls };
    },
  };
}
