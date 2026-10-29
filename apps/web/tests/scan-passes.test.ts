import { describe, expect, it } from "vitest";

import type { AiProvider } from "@shared/ports/ai-provider";
import type { MathRecognitionProvider } from "@shared/ports/math-recognition";

import { createMathPass } from "@modules/scan/application/math-recognition";
import type { ScanRun } from "@modules/scan/application/scan-store";
import { createSemanticPass } from "@modules/scan/application/semantic-review";
import type { OpenedPdf } from "@modules/scan/application/pdf-document";
import type { ScanItem } from "@modules/scan/domain/scan-item";
import type { ScanItemChanges } from "@modules/scan/application/scan-store";

/**
 * As passadas de máquina da varredura (#250): o desempate pela IA e o reconhecimento matemático.
 *
 * O provedor de IA e o de reconhecimento são portas — o dublê é a fronteira, e o que se prova é o
 * que a passada faz com a resposta: a IA não monta uma estrutura que a revisão manual recusaria, e
 * o LaTeX de modelo nunca entra no acervo como "sugerido" sem alguém olhar.
 */

const run = { id: "run-1", profileId: "book-v1" } as ScanRun;
const never = async () => false;

function item(over: Partial<ScanItem> & Pick<ScanItem, "id" | "key" | "kind">): ScanItem {
  const region = {
    pageNumber: 1,
    role: "PRIMARY" as const,
    box: { x: 0.1, y: 0.1, width: 0.5, height: 0.1 },
  };
  return {
    parentKey: null,
    originalLabel: null,
    number: null,
    title: null,
    pageNumber: 1,
    printedPage: null,
    regions: [region],
    text: "texto",
    latex: null,
    needsMath: false,
    confidence: 0.5,
    confidenceParts: {},
    evidence: [],
    diagnostic: null,
    metadata: {},
    reviewState: "NEEDS_REVIEW",
    sortOrder: 0,
    reviewedText: null,
    reviewedLatex: null,
    proposed: {
      kind: over.kind,
      parentKey: null,
      title: null,
      originalLabel: null,
      number: null,
      regions: [region],
      text: "texto",
      latex: null,
      confidence: 0.5,
    },
    origin: "SCAN",
    aiDecision: null,
    mathResult: null,
    documentNodeId: null,
    approvedAt: null,
    ...over,
  } as ScanItem;
}

/** A IA que responde sempre a mesma decisão, para a chave que vier. */
const answering = (decisions: readonly { key: string; kind: string }[]): AiProvider => ({
  id: "fake-ai",
  listModels: async () => [],
  run: async () => ({
    text: JSON.stringify({
      decisions: decisions.map((d) => ({ ...d, confidence: 0.9, reason: "palpite" })),
    }),
    toolCalls: [],
  }),
});

describe("desempate pela IA", () => {
  it("não troca o tipo de quem tem filho que o tipo novo não pode conter (CAP-17)", async () => {
    // A IA reclassifica a seção duvidosa como conteúdo. As subseções e o texto dela ficariam sob um
    // CONTENT — que não contém nada — e a aprovação os subiria para o avô, desmontando a estrutura.
    const capitulo = item({ id: "c", key: "C", kind: "CHAPTER", confidence: 0.95 });
    const secao = item({ id: "s", key: "S", kind: "SECTION", parentKey: "C", sortOrder: 1 });
    const sub = item({
      id: "u",
      key: "U",
      kind: "SUBSECTION",
      parentKey: "S",
      sortOrder: 2,
      confidence: 0.95,
    });

    const pass = createSemanticPass(answering([{ key: "S", kind: "CONTENT" }]), "modelo");
    const { changed } = await pass.run({ run, items: [capitulo, secao, sub], cancelled: never });

    expect(changed).toEqual([]);
  });

  it("não escolhe figura: a passada de figuras já rodou, e o parágrafo viraria figura sem arquivo (CAP-17)", async () => {
    const secao = item({ id: "s", key: "S", kind: "SECTION", confidence: 0.95 });
    const texto = item({ id: "t", key: "T", kind: "CONTENT", parentKey: "S", sortOrder: 1 });

    const pass = createSemanticPass(answering([{ key: "T", kind: "FIGURE" }]), "modelo");
    const { changed } = await pass.run({ run, items: [secao, texto], cancelled: never });

    expect(changed).toEqual([]);
  });
});

describe("reconhecimento matemático na varredura", () => {
  it("o item sugerido que recebe LaTeX do modelo volta a pedir revisão (SPG-07)", async () => {
    // O mesmo que o reprocessar à mão já fazia: a saída do modelo é candidata, não conteúdo.
    // Sem isto, "Aprovar com sugeridos" levava ao acervo o LaTeX que ninguém abriu.
    const sugerido = item({
      id: "s",
      key: "S",
      kind: "CONTENT",
      needsMath: true,
      reviewState: "AUTO_ACCEPTABLE",
    });
    const recognizer: MathRecognitionProvider = {
      id: "fake-vision",
      recognize: async () => ({
        latex: "$x \\pm 1$",
        confidence: 0.95,
        alternatives: [],
        providerId: "fake-vision",
        model: "m",
        durationMs: 1,
      }),
    };
    const pdf = {
      renderRegion: async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    } as unknown as OpenedPdf;
    const saved: ScanItemChanges[] = [];

    await createMathPass(recognizer, "m").run({
      run,
      items: [sugerido],
      pdf,
      policy: "auto",
      save: async (changes) => {
        saved.push(changes);
      },
      cancelled: never,
    });

    const [gravado] = saved.flatMap((changes) => changes.upserts);
    expect(gravado?.mathResult?.latex).toBe("$x \\pm 1$");
    expect(gravado?.reviewState).toBe("NEEDS_REVIEW");
  });
});
