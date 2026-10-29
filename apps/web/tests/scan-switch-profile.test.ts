import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { ScanRunner } from "@modules/scan/application/scan-store";
import { inheritReview, INHERIT_OVERLAP } from "@modules/scan/domain/inherit-review";
import type { ScanItem } from "@modules/scan/domain/scan-item";

import { createTempDatabase } from "./support/temp-database";
import { seedBookWithSource } from "./support/scan-seed";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * Trocar de perfil sem jogar fora a revisão.
 *
 * Quem está afinando um perfil varre o mesmo livro muitas vezes. Antes disto, cada troca zerava a
 * revisão, porque o perfil entra na `runKey` e a execução nova nasce vazia. O casamento é pela
 * posição no livro — a caixa é do papel, não da interpretação do perfil.
 */

const sha256 = async (text: string) => createHash("sha256").update(text).digest("hex");
const idle: ScanRunner = { ensure: () => undefined, isRunning: () => false };

function item(over: Partial<ScanItem> & Pick<ScanItem, "id">): ScanItem {
  const box = { x: 0.1, y: 0.1, width: 0.5, height: 0.1 };
  return {
    key: `k-${over.id}`,
    kind: "EXERCISE",
    parentKey: null,
    originalLabel: null,
    number: null,
    title: null,
    pageNumber: 1,
    printedPage: null,
    regions: [{ pageNumber: 1, role: "PRIMARY", box }],
    text: "",
    latex: null,
    needsMath: false,
    confidence: 0.9,
    confidenceParts: {},
    evidence: [],
    diagnostic: null,
    metadata: {},
    reviewState: "NEEDS_REVIEW",
    sortOrder: 0,
    reviewedText: null,
    reviewedLatex: null,
    proposed: { kind: "EXERCISE", parentKey: null, title: null, originalLabel: null, number: null, regions: [{ pageNumber: 1, role: "PRIMARY", box }], text: "", latex: null, confidence: 0.9 },
    origin: "SCAN",
    aiDecision: null,
    mathResult: null,
    documentNodeId: null,
    approvedAt: null,
    ...over,
  } as ScanItem;
}

const at = (page: number, y: number, height = 0.1) => [
  { pageNumber: page, role: "PRIMARY" as const, box: { x: 0.1, y, width: 0.5, height } },
];

describe("herdar a revisão ao trocar de perfil", () => {
  it("o mesmo lugar do livro herda o que a pessoa decidiu", () => {
    const anterior = [
      item({ id: "velho-1", regions: at(1, 0.1), reviewState: "APPROVED" }),
      item({ id: "velho-2", regions: at(1, 0.5), reviewState: "REJECTED" }),
      item({ id: "velho-3", regions: at(1, 0.8), reviewedLatex: "\\frac{1}{2}" }),
    ];
    // O perfil novo recorta diferente e chama os itens de outra coisa — o lugar é o mesmo.
    const novo = [
      item({ id: "novo-1", kind: "QUESTION", regions: at(1, 0.105) }),
      item({ id: "novo-2", kind: "QUESTION", regions: at(1, 0.505) }),
      item({ id: "novo-3", kind: "QUESTION", regions: at(1, 0.805) }),
    ];

    const herdado = inheritReview(anterior, novo);

    expect(herdado.map((h) => [h.id, h.reviewState])).toEqual([
      ["novo-1", "APPROVED"],
      ["novo-2", "REJECTED"],
      ["novo-3", "NEEDS_REVIEW"],
    ]);
    expect(herdado[2]?.reviewedLatex).toBe("\\frac{1}{2}");
  });

  it("estado de máquina não atravessa: a varredura nova acabou de produzi-lo", () => {
    const anterior = [
      item({ id: "velho-1", regions: at(1, 0.1), reviewState: "AUTO_ACCEPTABLE" }),
      item({ id: "velho-2", regions: at(1, 0.5), reviewState: "NEEDS_REVIEW" }),
    ];
    const novo = [item({ id: "novo-1", regions: at(1, 0.1) }), item({ id: "novo-2", regions: at(1, 0.5) })];

    expect(inheritReview(anterior, novo)).toEqual([]);
  });

  it("lugar diferente não herda, e página diferente muito menos", () => {
    const anterior = [item({ id: "velho", regions: at(1, 0.1), reviewState: "APPROVED" })];

    expect(inheritReview(anterior, [item({ id: "longe", regions: at(1, 0.6) })])).toEqual([]);
    expect(inheritReview(anterior, [item({ id: "outra-pagina", regions: at(2, 0.1) })])).toEqual([]);
  });

  it("um item anterior serve a um novo, no máximo", () => {
    // O perfil novo parte em dois o que o anterior via como um só: o aceite não se duplica. As
    // metades têm mais da metade da área do todo — menos que isso já não é o mesmo lugar (CAP-06).
    const anterior = [item({ id: "velho", regions: at(1, 0.1, 0.4), reviewState: "APPROVED" })];
    const novo = [item({ id: "metade-a", regions: at(1, 0.1, 0.22) }), item({ id: "metade-b", regions: at(1, 0.3, 0.22) })];

    const herdado = inheritReview(anterior, novo);
    expect(herdado).toHaveLength(1);
    expect(herdado[0]?.fromId).toBe("velho");
  });

  /*
    #250, CAP-06: o casamento olhava a interseção sobre a **menor** caixa, e dava o item anterior
    ao primeiro novo que casasse. Um título pequeno dentro do bloco revisado herdava o aceite e o
    LaTeX do bloco inteiro — e o texto do segundo parágrafo entrava duas vezes no corpo.
  */
  it("caixa pequena dentro da grande não herda: título e parágrafos de um bloco revisado (CAP-06)", () => {
    const anterior = [
      item({ id: "bloco", kind: "CONTENT", regions: at(1, 0.2, 0.4), reviewState: "APPROVED", reviewedLatex: "P1 corrigido. P2 corrigido." }),
    ];
    const novo = [
      item({ id: "titulo", kind: "SECTION", regions: at(1, 0.2, 0.03) }),
      item({ id: "p1", kind: "CONTENT", regions: at(1, 0.23, 0.18) }),
      item({ id: "p2", kind: "CONTENT", regions: at(1, 0.42, 0.18) }),
    ];

    expect(inheritReview(anterior, novo)).toEqual([]);
  });

  it("o anterior vai ao novo que mais coincide com ele, e não ao primeiro da lista", () => {
    const anterior = [item({ id: "velho", regions: at(1, 0.1), reviewState: "APPROVED" })];
    const novo = [item({ id: "vizinho", regions: at(1, 0.14) }), item({ id: "mesmo", regions: at(1, 0.1) })];

    expect(inheritReview(anterior, novo).map((h) => h.id)).toEqual(["mesmo"]);
  });

  it("o texto revisado só atravessa entre itens da mesma família de tipo", () => {
    // O lugar é o mesmo e o aceite atravessa — trocar de perfil é trocar de vocabulário —, mas o
    // LaTeX de um parágrafo não é o título de uma seção.
    const anterior = [item({ id: "velho", kind: "CONTENT", regions: at(1, 0.1), reviewState: "APPROVED", reviewedLatex: "Texto corrigido." })];

    const comoTitulo = inheritReview(anterior, [item({ id: "novo", kind: "SECTION", regions: at(1, 0.1) })]);
    expect(comoTitulo).toEqual([expect.objectContaining({ id: "novo", reviewState: "APPROVED", reviewedLatex: null })]);
    const comoExemplo = inheritReview(anterior, [item({ id: "novo", kind: "EXAMPLE", regions: at(1, 0.1) })]);
    expect(comoExemplo[0]?.reviewedLatex).toBe("Texto corrigido.");
  });

  it("o item que já está no acervo não empresta a revisão", () => {
    const anterior = [item({ id: "velho", regions: at(1, 0.1), reviewState: "APPROVED", documentNodeId: "no-1" })];

    expect(inheritReview(anterior, [item({ id: "novo", regions: at(1, 0.1) })])).toEqual([]);
  });

  it("o limiar é mais frouxo que o da aprovação, e de propósito", () => {
    // 0,8 é para o mesmo perfil consigo mesmo; aqui dois perfis recortam diferente.
    expect(INHERIT_OVERLAP).toBeLessThan(0.8);
    expect(INHERIT_OVERLAP).toBeGreaterThan(0.5);
  });
});

describe("trocar de perfil contra o banco", () => {
  let dispose: () => Promise<void>;

  beforeAll(async () => {
    dispose = (await createTempDatabase()).dispose;
  });
  afterAll(async () => {
    await dispose();
  });

  it("é execução nova, com chave própria, que aponta para a anterior", async () => {
    const seeded = await seedBookWithSource("book-a.pdf", "troca-a");
    const { PrismaScanStore, PrismaScanSources, storageKeyOfAsset } = await import(
      "@modules/scan/infrastructure/prisma-scan-store"
    );
    const { PdfjsDocumentReader } = await import("@modules/scan/infrastructure/pdfjs-document-reader");
    const { startScan } = await import("@modules/scan/application/start-scan");
    const { runScan } = await import("@modules/scan/application/run-scan");
    const { switchProfile } = await import("@modules/scan/application/switch-profile");
    const { reviewScan } = await import("@modules/scan/application/review-scan");

    const store = new PrismaScanStore();
    const deps = { store, runner: idle, sources: new PrismaScanSources(), sha256 };
    const runDeps = { store, storage: seeded.storage, opener: new PdfjsDocumentReader(), sourceKey: storageKeyOfAsset };

    const { run } = await startScan(deps, {
      publicationId: seeded.publication.id,
      profileId: "book-v1",
      recognizeMath: "never",
    });
    await runScan(runDeps, run.id);

    // Uma decisão humana, que é o que precisa atravessar.
    const alvo = (await store.listItems(run.id)).find((i) => i.kind === "EXERCISE")!;
    await reviewScan({ store, newId: () => "novo" }, run.id, { type: "accept", itemIds: [alvo.id] });

    const { run: trocada } = await switchProfile(deps, { runId: run.id, profileId: "exam-v1" });

    expect(trocada.id).not.toBe(run.id);
    expect(trocada.profileId).toBe("exam-v1");
    expect(trocada.inheritedFromRunId).toBe(run.id);
    // A chave não mente: é outra varredura, e a anterior continua inteira ao lado.
    expect(trocada.runKey).not.toBe(run.runKey);
    expect(await store.findRun(run.id)).not.toBeNull();
    // O intervalo e as opções vêm da anterior: trocar de perfil é trocar só o perfil.
    expect(trocada.settings).toEqual(run.settings);

    await runScan(runDeps, trocada.id);
    const pronta = await store.findRun(trocada.id);
    expect(pronta?.warnings.join(" ")).toMatch(/Trocou de perfil/);
  });
});
