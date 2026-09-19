import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { ScanRunner } from "@modules/scan/application/scan-store";
import { questionLatex } from "@modules/scan/domain/approval-latex";
import { captureProfile } from "@modules/scan/domain/profiles";
import { applyReview, InvalidReviewError } from "@modules/scan/domain/review";
import type { ScanItem } from "@modules/scan/domain/scan-item";

import { createTempDatabase } from "./support/temp-database";
import { seedBookWithSource } from "./support/scan-seed";

// Lê PDF de verdade e, em alguns casos, monta um SQLite com as migrações: sozinho leva um ou dois
// segundos, e com a suíte inteira em paralelo passa dos 5 s padrão. Limite explícito, não sorte.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * Revisão e aprovação da proposta (Fases 7 e 8 do prompt 03 · D45, D53 · ADR 0002), com o banco
 * de verdade. O aceite da Fase 1 no acervo: o exercício que vira a página chega como um nó com
 * duas âncoras.
 */

const book = captureProfile("book-v1")!;
const sha256 = async (text: string) => createHash("sha256").update(text).digest("hex");
const idle: ScanRunner = { ensure: () => undefined, isRunning: () => false };

function item(partial: Partial<ScanItem> & Pick<ScanItem, "id" | "key" | "kind">): ScanItem {
  const base = {
    parentKey: null,
    originalLabel: null,
    number: null,
    title: null,
    pageNumber: 1,
    printedPage: null,
    regions: [{ pageNumber: 1, role: "PRIMARY" as const, box: { x: 0.1, y: 0.1, width: 0.5, height: 0.1 } }],
    text: "",
    latex: null,
    needsMath: false,
    confidence: 0.9,
    confidenceParts: {},
    evidence: [],
    diagnostic: null,
    metadata: {},
    reviewState: "NEEDS_REVIEW" as const,
    sortOrder: 0,
    reviewedText: null,
    reviewedLatex: null,
    origin: "SCAN" as const,
    aiDecision: null,
    mathResult: null,
    documentNodeId: null,
    approvedAt: null,
  };
  const merged = { ...base, ...partial };
  return {
    ...merged,
    proposed: {
      kind: merged.kind,
      parentKey: merged.parentKey,
      title: merged.title,
      originalLabel: merged.originalLabel,
      number: merged.number,
      regions: merged.regions,
      text: merged.text,
      latex: merged.latex,
      confidence: merged.confidence,
    },
  };
}

describe("operações de revisão", () => {
  const chapter = item({ id: "c", key: "C", kind: "CHAPTER", sortOrder: 0 });
  const section = item({ id: "s", key: "S", kind: "SECTION", parentKey: "C", sortOrder: 1 });
  const exercise = item({
    id: "e",
    key: "E",
    kind: "EXERCISE",
    parentKey: "S",
    sortOrder: 2,
    regions: [
      { pageNumber: 1, role: "PRIMARY", box: { x: 0.1, y: 0.8, width: 0.8, height: 0.15 } },
      { pageNumber: 2, role: "CONTINUATION", box: { x: 0.1, y: 0.05, width: 0.8, height: 0.1 } },
    ],
  });
  const items = [chapter, section, exercise];
  let seq = 0;
  const newId = () => `new-${++seq}`;

  it("trocar tipo respeita o pai e os filhos", () => {
    expect(() => applyReview(items, { type: "setKind", itemId: "s", kind: "PART" }, book, newId)).toThrow(InvalidReviewError);
    expect(() => applyReview(items, { type: "setKind", itemId: "s", kind: "WHATEVER" }, book, newId)).toThrow(/não conhece/);
    // Uma seção com exercício dentro não vira exemplo: exemplo não contém exercício.
    expect(() => applyReview(items, { type: "setKind", itemId: "s", kind: "EXAMPLE" }, book, newId)).toThrow(/não pode conter/);
    const changed = applyReview(items, { type: "setKind", itemId: "e", kind: "EXAMPLE" }, book, newId).upserts[0];
    expect(changed?.kind).toBe("EXAMPLE");
    // O retrato não muda: é o que o scan propôs.
    expect(changed?.proposed.kind).toBe("EXERCISE");
  });

  it("reparentear recusa ciclo; promover e rebaixar mudam o pai", () => {
    expect(() => applyReview(items, { type: "reparent", itemId: "c", parentId: "s" }, book, newId)).toThrow(/si mesmo/);
    expect(applyReview(items, { type: "promote", itemId: "e" }, book, newId).upserts[0]?.parentKey).toBe("C");
    const flat = [chapter, { ...section, parentKey: "C" }, { ...exercise, parentKey: "C", sortOrder: 2 }];
    expect(applyReview(flat, { type: "demote", itemId: "e" }, book, newId).upserts[0]?.parentKey).toBe("S");
  });

  it("separar a segunda âncora cria um item novo; unir devolve um só", () => {
    const split = applyReview(items, { type: "split", itemId: "e", regionIndex: 1 }, book, newId);
    const [kept, created] = split.upserts;
    expect(kept?.regions).toHaveLength(1);
    expect(created?.regions.map((r) => [r.pageNumber, r.role])).toEqual([[2, "PRIMARY"]]);
    expect(created?.origin).toBe("SPLIT");

    const after = [chapter, section, kept!, created!];
    const merged = applyReview(after, { type: "merge", itemIds: [kept!.id, created!.id] }, book, newId);
    expect(merged.deletedIds).toEqual([created!.id]);
    expect(merged.upserts[0]?.regions.map((r) => r.role)).toEqual(["PRIMARY", "CONTINUATION"]);
  });

  it("âncora: acrescentar, redimensionar, reordenar e marcar papel; a primeira é a principal", () => {
    const moved = applyReview(items, { type: "moveRegion", itemId: "e", from: 1, to: 0 }, book, newId).upserts[0];
    expect(moved?.regions.map((r) => [r.pageNumber, r.role])).toEqual([
      [2, "PRIMARY"],
      [1, "CONTINUATION"],
    ]);
    expect(() =>
      applyReview(items, { type: "resizeRegion", itemId: "e", regionIndex: 0, box: { x: 0.5, y: 0.5, width: 0.9, height: 0.1 } }, book, newId),
    ).toThrow(/sai da página/);
    expect(() => applyReview(items, { type: "removeRegion", itemId: "c", regionIndex: 0 }, book, newId)).toThrow(/pelo menos uma/);
    const role = applyReview(items, { type: "setRegionRole", itemId: "e", regionIndex: 1, role: "ANSWER" }, book, newId).upserts[0];
    expect(role?.regions[1]?.role).toBe("ANSWER");
  });

  it("editar texto e LaTeX guarda ao lado do original; item no acervo fica travado", () => {
    const edited = applyReview(items, { type: "editLatex", itemId: "e", latex: "\\frac12" }, book, newId).upserts[0];
    expect([edited?.reviewedLatex, edited?.latex]).toEqual(["\\frac12", null]);
    const locked = [{ ...exercise, documentNodeId: "n1" }];
    expect(() => applyReview(locked, { type: "editText", itemId: "e", text: "x" }, book, newId)).toThrow(/editor/);
  });

  it("aceitar o sugerido pega só o AUTO_ACCEPTABLE", () => {
    const withSuggested = [{ ...chapter, reviewState: "AUTO_ACCEPTABLE" as const }, section];
    expect(applyReview(withSuggested, { type: "acceptSuggested" }, book, newId).upserts.map((i) => i.id)).toEqual(["c"]);
  });

  it("marcar um item à mão exige tipo que o pai aceite", () => {
    const region = { pageNumber: 1, role: "PRIMARY", box: { x: 0.1, y: 0.1, width: 0.2, height: 0.1 } } as const;
    expect(() => applyReview(items, { type: "addItem", kind: "ITEM", parentId: "c", afterId: null, region }, book, newId)).toThrow();
    const added = applyReview(items, { type: "addItem", kind: "EXERCISE", parentId: "s", afterId: "s", region }, book, newId).upserts[0];
    expect([added?.origin, added?.parentKey, added?.sortOrder]).toEqual(["MANUAL", "S", 2]);
  });
});

describe("LaTeX da aprovação", () => {
  it("exercício com itens vira enunciado + enumerate de rótulo explícito", () => {
    const exercise = item({
      id: "e",
      key: "E",
      kind: "EXERCISE",
      text: "2. Calcule:\na) f(1) para f(x) = 2x;\nb) f(−3) para f(x) = 7x.",
    });
    const a = item({ id: "a", key: "A", kind: "ITEM", parentKey: "E", originalLabel: "a)", text: "a) f(1) para f(x) = 2x;" });
    const b = item({ id: "b", key: "B", kind: "ITEM", parentKey: "E", originalLabel: "b)", text: "b) f(−3) para f(x) = 7x." });
    const latex = questionLatex(exercise, [a, b], false);
    expect(latex.statementLatex).toBe(
      "Calcule:\n\\begin{enumerate}\n  \\item[a)] f(1) para f(x) = 2x;\n  \\item[b)] f(−3) para f(x) = 7x.\n\\end{enumerate}",
    );
  });

  it("questão de prova separa as alternativas e desfaz a hifenização", () => {
    const question = item({
      id: "q",
      key: "Q",
      kind: "QUESTION",
      text: "QUESTÃO 136\nUm enunciado sinté-\ntico de teste.\nA primeira;\nB segunda\ncontinuada;\nC terceira;\nD quarta;\nE quinta.",
    });
    const latex = questionLatex(question, [], true);
    expect(latex.statementLatex).toBe("Um enunciado sintético de teste.");
    expect(latex.options).toEqual(["primeira;", "segunda continuada;", "terceira;", "quarta;", "quinta."]);
  });

  it("o LaTeX revisado ou reconhecido vence o texto", () => {
    const recognized = item({
      id: "r",
      key: "R",
      kind: "EXERCISE",
      text: "1. x2",
      mathResult: { latex: "Calcule $x^2$", confidence: 0.9, alternatives: [], providerId: "v", model: "m", durationMs: 1, recognizedAt: "" },
    });
    expect(questionLatex(recognized, [], false).statementLatex).toBe("Calcule $x^2$");
    expect(questionLatex({ ...recognized, reviewedLatex: "Revisado" }, [], false).statementLatex).toBe("Revisado");
  });
});

describe("aprovação contra o banco", () => {
  let dispose: () => Promise<void>;
  beforeAll(async () => {
    dispose = (await createTempDatabase()).dispose;
  });
  afterAll(async () => {
    await dispose();
  });

  async function scanned(fixture: string, slug: string, profileId: string) {
    const seeded = await seedBookWithSource(fixture, slug);
    const { PrismaScanStore, PrismaScanSources, storageKeyOfAsset } = await import("@modules/scan/infrastructure/prisma-scan-store");
    const { PdfjsDocumentReader } = await import("@modules/scan/infrastructure/pdfjs-document-reader");
    const { PrismaScanApproval } = await import("@modules/scan/infrastructure/prisma-scan-approval");
    const { startScan } = await import("@modules/scan/application/start-scan");
    const { runScan } = await import("@modules/scan/application/run-scan");
    const store = new PrismaScanStore();
    const opener = new PdfjsDocumentReader();
    const scan = async (forceNew = false) => {
      const { run } = await startScan(
        { store, runner: idle, sources: new PrismaScanSources(), sha256 },
        { publicationId: seeded.publication.id, profileId, recognizeMath: "never", forceNew },
      );
      await runScan({ store, storage: seeded.storage, opener, sourceKey: storageKeyOfAsset }, run.id);
      return run.id;
    };
    return { ...seeded, store, writer: new PrismaScanApproval(), scan };
  }

  it("o livro inteiro entra: capítulo, seções, teoria no corpo, exercícios a revisar", async () => {
    const { approveScan } = await import("@modules/scan/application/approve-scan");
    const { reviewScan } = await import("@modules/scan/application/review-scan");
    const { prisma, publication, store, writer, scan } = await scanned("book-a.pdf", "approve-a", "book-v1");

    const runId = await scan();
    await reviewScan({ store, newId: () => crypto.randomUUID() }, runId, { type: "acceptSuggested" });
    const { summary, skipped } = await approveScan({ store, writer }, { runId, destinationId: null, includeSuggested: false });

    expect(skipped).toEqual([]);
    // 13 e não 11: os dois exemplos passaram a ser nós, em vez de negrito no corpo da seção (D56).
    expect(summary).toMatchObject({ createdNodes: 13, createdQuestions: 5, reusedNodes: 0, alreadyInCollection: 0 });

    const nodes = await prisma.documentNode.findMany({
      where: { publicationId: publication.id },
      select: { id: true, kind: true, title: true, originalLabel: true, parentId: true, bodyLatex: true, questionId: true },
    });
    const chapter = nodes.find((n) => n.kind === "CHAPTER");
    expect([chapter?.title, chapter?.originalLabel, chapter?.parentId]).toEqual(["Funções", "1", null]);
    const section = nodes.find((n) => n.originalLabel === "1.1");
    expect(section?.parentId).toBe(chapter?.id);
    // A teoria vai para o corpo da seção; o exemplo, não — ele virou galho (D56).
    expect(section?.bodyLatex).toContain("Uma função");
    expect(section?.bodyLatex).toContain("Toda função linear");
    expect(section?.bodyLatex).not.toContain("Exemplo 1");

    // O exemplo é nó da seção, com rótulo, título vindo do texto e a resolução no corpo.
    const example = nodes.find((n) => n.kind === "EXAMPLE");
    expect(example?.parentId).toBe(section?.id);
    expect(example?.originalLabel).toBe("1");
    expect(example?.title).toContain("A função f(x) = 3x é linear");
    expect(example?.bodyLatex).toContain("Este segundo parágrafo é a resolução do exemplo");
    // O rótulo mora no nó: repeti-lo no corpo diria a mesma coisa duas vezes.
    expect(example?.bodyLatex.startsWith("A função")).toBe(true);

    const groups = nodes.filter((n) => n.kind === "QUESTION_GROUP");
    expect(groups).toHaveLength(2);
    const questions = await prisma.question.findMany({
      where: { node: { publicationId: publication.id } },
      select: { status: true, type: true, statementLatex: true, originalLatex: true, sourceAnchorId: true },
    });
    expect(questions).toHaveLength(5);
    expect(questions.every((q) => q.status === "DRAFT" && q.type === "DISCURSIVE" && q.sourceAnchorId !== null)).toBe(true);
    expect(questions.some((q) => q.statementLatex.includes("\\item[a)]"))).toBe(true);

    const anchors = await prisma.sourceAnchor.findMany({ where: { publicationId: publication.id } });
    expect(anchors.every((a) => a.extractionMethod === "scan:book-v1@1")).toBe(true);

    const run = await store.findRun(runId);
    expect(run?.state).toBe("APPROVED");
    const history = await prisma.revision.count({ where: { entityType: "DOCUMENT_NODE", entityId: section!.id } });
    expect(history).toBeGreaterThan(0);

    // Aprovar de novo não faz nada.
    const again = await approveScan({ store, writer }, { runId, destinationId: null, includeSuggested: true });
    expect(again.summary.createdNodes).toBe(0);

    // Um scan novo do mesmo livro: os títulos são reaproveitados e o resto está "já no acervo".
    const second = await scan(true);
    const repeat = await approveScan({ store, writer }, { runId: second, destinationId: null, includeSuggested: true });
    expect(repeat.summary.createdNodes).toBe(0);
    expect(repeat.summary.reusedNodes).toBeGreaterThan(0);
    expect(repeat.summary.alreadyInCollection).toBeGreaterThan(0);
    expect(await prisma.documentNode.count({ where: { publicationId: publication.id } })).toBe(nodes.length);
  });

  it("o exercício que vira a página é um nó com duas âncoras, e a questão as acha", async () => {
    const { approveScan } = await import("@modules/scan/application/approve-scan");
    const { PrismaNodeAnchors } = await import("@modules/assets/infrastructure/prisma-node-anchors");
    const { prisma, publication, store, writer, scan } = await scanned("book-c.pdf", "approve-c", "book-v1");

    const runId = await scan();
    await approveScan({ store, writer }, { runId, destinationId: null, includeSuggested: true });

    const node = await prisma.documentNode.findFirstOrThrow({
      where: { publicationId: publication.id, kind: "QUESTION", originalLabel: "2" },
      select: { questionId: true },
    });
    const anchors = await new PrismaNodeAnchors().listForQuestion(node.questionId!);
    expect(anchors.map((a) => [a.pageNumber, a.role])).toEqual([
      [2, "PRIMARY"],
      [3, "CONTINUATION"],
    ]);
    // Os seis itens foram dobrados no enunciado, não viraram nós.
    expect(await prisma.documentNode.count({ where: { publicationId: publication.id, kind: "QUESTION" } })).toBe(3);
  });

  it("filho de pai pendente fica de fora, com o motivo; e a prova chega com alternativas", async () => {
    const { approveScan } = await import("@modules/scan/application/approve-scan");
    const { reviewScan } = await import("@modules/scan/application/review-scan");
    const { prisma, publication, store, writer, scan } = await scanned("enem-sintetico.pdf", "approve-enem", "exam-enem-v1");

    const runId = await scan();
    const items = await store.listItems(runId);
    const q136 = items.find((i) => i.metadata["identity"] === "136")!;
    await reviewScan({ store, newId: () => crypto.randomUUID() }, runId, { type: "accept", itemIds: [q136.id] });

    const first = await approveScan({ store, writer }, { runId, destinationId: null, includeSuggested: false });
    expect(first.summary.createdNodes).toBe(0);
    expect(first.skipped).toEqual([{ itemId: q136.id, reason: "o item acima dele ainda não foi aprovado" }]);

    const all = await approveScan({ store, writer }, { runId, destinationId: null, includeSuggested: true });
    expect(all.summary.createdQuestions).toBe(11);
    const question = await prisma.question.findFirstOrThrow({
      where: { node: { publicationId: publication.id, originalLabel: "136" } },
      select: { type: true, statementLatex: true, options: { orderBy: { sortKey: "asc" }, select: { statementLatex: true } } },
    });
    expect(question.type).toBe("MULTIPLE_CHOICE");
    expect(question.statementLatex).not.toContain("QUESTÃO");
    expect(question.options.map((o) => o.statementLatex)).toEqual([
      "primeira alternativa.",
      "segunda alternativa.",
      "terceira alternativa.",
      "quarta alternativa.",
      "quinta alternativa.",
    ]);
  });
});
