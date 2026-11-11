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

/** A página sem texto: o recorte vai inteiro, sem pedaços. */
const paginaVazia = async (pageNumber: number) => ({ pageNumber, width: 595, height: 842, spans: [], graphics: [] });

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
      readPage: paginaVazia,
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

  it("o reconhecimento que muda número deixa o item suspeito, com o porquê (D78)", async () => {
    // p. 16 do Fundamentos: o livro diz "3/2 = 6/4", e o modelo escreveu "3/2 = 6".
    const texto = item({ id: "t", key: "T", kind: "CONTENT", needsMath: true, text: "2º) p: 3 2  6 4" });
    const recognizer: MathRecognitionProvider = {
      id: "fake-vision",
      recognize: async () => ({ latex: "$2^{\\circ}$) p: $\\frac{3}{2} = 6$", confidence: 0.9, alternatives: [], providerId: "fake-vision", model: "m", durationMs: 1 }),
    };
    const saved: ScanItemChanges[] = [];
    await createMathPass(recognizer, "m").run({
      run,
      items: [texto],
      pdf: { renderRegion: async () => new Uint8Array([0x89]), readPage: paginaVazia } as unknown as OpenedPdf,
      policy: "auto",
      save: async (changes) => {
        saved.push(changes);
      },
      cancelled: never,
    });

    const [gravado] = saved.flatMap((changes) => changes.upserts);
    expect(gravado?.diagnostic).toMatchObject({
      status: "suspicious",
      reasons: ["o reconhecimento difere do PDF nos números: falta 4; sobra —"],
    });
  });

  it("o pedaço que inventa número ou V/F é reconhecido de novo, em metades (D78)", async () => {
    // p. 18 do Fundamentos: o modelo escreveu uma tabela-verdade que o livro não tem.
    const linha = (text: string, y: number) => ({ text, x0: 60, x1: 400, baseline: y + 8, size: 10, fontName: "X", endsLine: true });
    // Dois parágrafos de três linhas, separados por um espaço de sobra: um pedaço só, que se parte em dois.
    const spans = [
      ...["Seja f uma proposição.", "Dizemos que f é falsa.", "independentemente de p."].map((t, i) => linha(t, 100 + i * 14)),
      ...["Assim, a tabela-verdade", "de f apresenta só", "a coluna de f."].map((t, i) => linha(t, 170 + i * 14)),
    ];
    const texto = item({ id: "t", key: "T", kind: "CONTENT", needsMath: true, text: "Seja f…", regions: [{ pageNumber: 18, role: "PRIMARY", box: { x: 0.05, y: 0.1, width: 0.9, height: 0.12 } }] });
    const respostas = ["Seja f. Tabela: V V F F V F F V", "Seja $f$ uma proposição.", "Assim, a tabela-verdade de $f$."];
    const recognizer: MathRecognitionProvider = {
      id: "fake-vision",
      recognize: async () => ({ latex: respostas.shift() ?? "", confidence: 0.9, alternatives: [], providerId: "fake-vision", model: "m", durationMs: 1 }),
    };
    const saved: ScanItemChanges[] = [];
    await createMathPass(recognizer, "m").run({
      run,
      items: [texto],
      pdf: {
        renderRegion: async () => new Uint8Array([0x89]),
        readPage: async (pageNumber: number) => ({ pageNumber, width: 595, height: 842, spans, graphics: [] }),
      } as unknown as OpenedPdf,
      policy: "auto",
      save: async (changes) => {
        saved.push(changes);
      },
      cancelled: never,
    });

    const [gravado] = saved.flatMap((changes) => changes.upserts);
    expect(gravado?.mathResult?.latex).toBe("Seja $f$ uma proposição.\n\nAssim, a tabela-verdade de $f$.");
  });

  it("a figura que é item próprio sai em branco do recorte do texto em volta (D78)", async () => {
    // A tabela-verdade da p. 17 do Fundamentos ia ao modelo junto do texto, e saía duas vezes:
    // no corpo, transcrita, e na figura.
    const regiao = (pageNumber: number, x: number, y: number) => [
      { pageNumber, role: "PRIMARY" as const, box: { x, y, width: 0.3, height: 0.1 } },
    ];
    const texto = item({ id: "t", key: "T", kind: "CONTENT", needsMath: true, regions: [{ pageNumber: 17, role: "PRIMARY", box: { x: 0.1, y: 0.1, width: 0.8, height: 0.6 } }] });
    const tabela = item({ id: "f", key: "F", kind: "FIGURE", regions: regiao(17, 0.2, 0.5) });
    const longe = item({ id: "g", key: "G", kind: "FIGURE", regions: regiao(17, 0.2, 0.85) });
    const outraPagina = item({ id: "h", key: "H", kind: "FIGURE", regions: regiao(18, 0.2, 0.5) });
    const recognizer: MathRecognitionProvider = {
      id: "fake-vision",
      recognize: async () => ({ latex: "x", confidence: 0.9, alternatives: [], providerId: "fake-vision", model: "m", durationMs: 1 }),
    };
    const masks: unknown[] = [];
    const pdf = {
      renderRegion: async (_page: number, _box: unknown, _dpi: number, given: readonly unknown[] = []) => {
        masks.push(...given);
        return new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
      },
      readPage: paginaVazia,
    } as unknown as OpenedPdf;

    await createMathPass(recognizer, "m").run({
      run,
      items: [texto],
      figures: [tabela, longe, outraPagina],
      pdf,
      policy: "auto",
      save: async () => undefined,
      cancelled: never,
    });

    expect(masks).toEqual([tabela.regions[0]!.box]);
  });
});
