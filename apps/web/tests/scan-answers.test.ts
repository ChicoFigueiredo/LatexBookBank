import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { answerLatex, answerLetter } from "@modules/scan/domain/approval-latex";
import { planApproval, type ApprovalInput } from "@modules/scan/domain/approval-plan";
import { buildLines, type RawPage, type RawSpan } from "@modules/scan/domain/page";
import { captureProfile } from "@modules/scan/domain/profiles";
import type { ProposedItem } from "@modules/scan/domain/proposal";
import type { ScanItem } from "@modules/scan/domain/scan-item";
import { buildProposal } from "@modules/scan/domain/structure";

import { createTempDatabase } from "./support/temp-database";
import { seedBookWithSource } from "./support/scan-seed";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * As respostas que o livro imprime nas páginas de respostas, levadas às questões (D77).
 *
 * O *Fundamentos* traz dois gabaritos — o dos exercícios e o dos vestibulares — que o scan pulava.
 * Agora cada "135." é uma Resposta, que a aprovação grava na questão do mesmo número: a letra
 * marca a alternativa, e o resto vai à Resposta.
 */

const profile = captureProfile("book-fme-v1")!;
const LEFT = 50;
const RIGHT = 300;

const span = (text: string, x0: number, baseline: number, extra: Partial<RawSpan> = {}): RawSpan => ({
  text,
  x0,
  x1: x0 + text.length * (extra.size ?? 9) * 0.5,
  baseline,
  size: 9,
  fontName: "Times-Roman",
  endsLine: true,
  ...extra,
});

/** Uma linha de trechos lado a lado, com o espaço que a página dá entre eles. */
const row = (pieces: readonly (readonly [string, number, Partial<RawSpan>?])[], baseline: number): RawSpan[] =>
  pieces.map(([text, x0, extra], index) => span(text, x0, baseline, { ...extra, endsLine: index === pieces.length - 1 }));

const number = (text: string, x0: number, baseline: number): RawSpan =>
  span(text, x0, baseline, { fontName: "Times-Bold", endsLine: false });

/** O corpo: o banner do bloco e três exercícios, para as respostas terem a quem ir. */
function bodyPage(): RawPage {
  const spans: RawSpan[] = [span("E X E R C Í C I O S", LEFT + 100, 80, { size: 19, fontName: "Times-Bold" })];
  let y = 110;
  for (let n = 1; n <= 5; n++, y += 24) {
    spans.push(number(`${n}.`, LEFT, y), span(`Enunciado do exercício ${n}, com texto que ocupa a linha.`, LEFT + 20, y, { size: 10 }));
  }
  return { pageNumber: 1, width: 595, height: 842, spans, graphics: [] };
}

/** A página de respostas, em duas colunas, com o "Capítulo II" no meio e duas respostas numa linha. */
function answersPage(): RawPage {
  const spans: RawSpan[] = [
    span("RESPOSTAS DOS EXERCÍCIOS", RIGHT, 40, { size: 6.7 }),
    ...row([["1.", LEFT, { fontName: "Times-Bold" }], ["a) V", LEFT + 18]], 100),
    ...row([["b) F", LEFT + 18]], 114),
    ...row([["Capítulo II", LEFT, { size: 13, fontName: "Times-Bold" }]], 140),
    ...row([["2.", LEFT, { fontName: "Times-Bold" }], ["7", LEFT + 18]], 166),
    ...row([["3.", RIGHT, { fontName: "Times-Bold" }], ["{1, 2}", RIGHT + 18]], 100),
    // "4. c   5. d": duas respostas na mesma linha, que a camada de texto entrega como uma.
    ...row(
      [
        ["4.", RIGHT, { fontName: "Times-Bold" }],
        ["c", RIGHT + 18],
        ["5.", RIGHT + 60, { fontName: "Times-Bold" }],
        ["d", RIGHT + 78],
      ],
      114,
    ),
  ];
  return { pageNumber: 2, width: 595, height: 842, spans, graphics: [] };
}

describe("o motor nas páginas de respostas", () => {
  const proposal = buildProposal([buildLines(bodyPage()), buildLines(answersPage())], profile);
  const answers = proposal.items.filter((item) => item.kind === "ANSWER");

  it("cada número abre uma Resposta, em ordem, e as colunas são lidas uma depois da outra", () => {
    expect(answers.map((answer) => answer.number)).toEqual(["1", "2", "3", "4", "5"]);
    expect(answers.every((answer) => answer.metadata["answersTo"] === "EXERCISE")).toBe(true);
  });

  it("o capítulo no meio fecha a resposta, e não entra no texto dela", () => {
    expect(answers[0]?.text).toBe("1. a) V\nb) F");
  });

  it("duas respostas na mesma linha viram duas", () => {
    expect(answers.slice(3).map((answer) => answer.text)).toEqual(["4. c", "5. d"]);
  });

  it("a zona de respostas não vira estrutura, e não sobra aviso de zona pulada", () => {
    expect(proposal.items.filter((item) => item.pageNumber === 2 && item.kind !== "ANSWER")).toEqual([]);
    expect(proposal.warnings.filter((warning) => warning.includes("respostas dos exercícios"))).toEqual([]);
  });
});

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
    reviewState: "APPROVED" as const,
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
  return { ...merged, proposed: { ...merged, kind: merged.kind } } as ScanItem;
}

const recognized = (latex: string) => ({
  latex,
  confidence: 0.9,
  alternatives: [],
  providerId: "ollama",
  model: "teste",
  durationMs: 1,
  recognizedAt: "2026-11-11T00:00:00.000Z",
});

describe("o LaTeX da Resposta", () => {
  it("sai sem o número, e cada linha do gabarito é um parágrafo", () => {
    const resposta = item({ id: "r", key: "R", kind: "ANSWER", originalLabel: "13.", text: "13. a) {9, 6, 3}\nb) {1, 2}" });
    expect(answerLatex(resposta, [])).toBe("a) \\{9, 6, 3\\}\n\nb) \\{1, 2\\}");
  });

  it("o reconhecimento vale mais que a camada de texto, e também sai sem o número", () => {
    const resposta = item({ id: "r", key: "R", kind: "ANSWER", originalLabel: "26.", text: "26. círculo", mathResult: recognized("26. círculo de centro $O$ e raio $2r$") });
    expect(answerLatex(resposta, [])).toBe("círculo de centro $O$ e raio $2r$");
  });

  it("a letra sozinha é alternativa; resposta com itens não é", () => {
    expect(answerLetter(item({ id: "a", key: "A", kind: "ANSWER", originalLabel: "36.", text: "36. d" }))).toBe("d");
    expect(answerLetter(item({ id: "b", key: "B", kind: "ANSWER", originalLabel: "79.", text: "79. a) 1, 2, 3 e 4." }))).toBeNull();
    expect(answerLetter(item({ id: "c", key: "C", kind: "ANSWER", originalLabel: "19.", text: "19. 70" }))).toBeNull();
  });
});

describe("a aprovação leva a resposta à questão do mesmo número", () => {
  const exercicio = item({ id: "e1", key: "E1", kind: "EXERCISE", number: "1", text: "1. Calcule." });
  const respostaDoExercicio = item({ id: "a1", key: "A1", kind: "ANSWER", number: "1", originalLabel: "1.", text: "1. a) V", metadata: { answersTo: "EXERCISE" }, sortOrder: 5 });
  const questao = item({ id: "q2", key: "Q2", kind: "QUESTION", number: "2", text: "2. (UF) Qual?", sortOrder: 1 });
  const respostaDaQuestao = item({ id: "a2", key: "A2", kind: "ANSWER", number: "2", originalLabel: "2.", text: "2. d", metadata: { answersTo: "QUESTION" }, sortOrder: 6 });

  const plan = (items: readonly ScanItem[], over: Partial<ApprovalInput> = {}) =>
    planApproval({
      items,
      profile: { id: "book-fme-v1", version: 1, defaultQuestionType: "DISCURSIVE" },
      destinationId: null,
      includeSuggested: false,
      existingNodes: [],
      existingAnchors: [],
      ...over,
    });

  it("a resposta do exercício vai à Resposta; a da questão, à alternativa", () => {
    const { steps, skipped } = plan([exercicio, questao, respostaDoExercicio, respostaDaQuestao]);
    const answers = steps.filter((step) => step.type === "setAnswer");

    expect(skipped).toEqual([]);
    expect(answers).toMatchObject([
      { target: { type: "planned", ref: "e1" }, answerLatex: "a) V", correctLetter: null },
      { target: { type: "planned", ref: "q2" }, answerLatex: "", correctLetter: "d" },
    ]);
  });

  it("sem a questão aprovada, a resposta espera, e diz por quê", () => {
    const pendente = { ...exercicio, reviewState: "NEEDS_REVIEW" as const };
    const { steps, skipped } = plan([pendente, respostaDoExercicio]);

    expect(steps.filter((step) => step.type === "setAnswer")).toEqual([]);
    expect(skipped).toEqual([{ itemId: "a1", reason: "o exercício 1 ainda não foi aprovado" }]);
  });

  it("não escreve em questão de outra importação", () => {
    // A varredura achou o exercício 1 já no acervo, no mesmo lugar: o nó é de outra importação.
    const { steps, skipped } = plan([exercicio, respostaDoExercicio], {
      existingNodes: [{ id: "outro", parentId: null, kind: "QUESTION", title: null, originalLabel: "1" }],
      existingAnchors: [{ nodeId: "outro", pageNumber: 1, box: exercicio.regions[0]!.box, role: "PRIMARY", cropped: false }],
    });

    expect(steps.filter((step) => step.type === "setAnswer")).toEqual([]);
    expect(skipped).toEqual([{ itemId: "a1", reason: "o exercício 1 é de outra importação" }]);
  });
});

describe("a resposta no acervo", () => {
  let dispose: () => Promise<void>;
  beforeAll(async () => {
    dispose = (await createTempDatabase()).dispose;
  });
  afterAll(async () => {
    await dispose();
  });

  it("grava a Resposta do exercício e marca a alternativa da questão de vestibular", async () => {
    const { prisma, publication } = await seedBookWithSource("book-a.pdf", "respostas");
    const { PrismaScanStore } = await import("@modules/scan/infrastructure/prisma-scan-store");
    const { PrismaScanApproval } = await import("@modules/scan/infrastructure/prisma-scan-approval");
    const { approveScan } = await import("@modules/scan/application/approve-scan");
    const store = new PrismaScanStore();
    const source = await prisma.asset.findFirstOrThrow({ where: { publicationId: publication.id } });

    const run = await store.createRun({
      workspaceId: publication.workspaceId,
      publicationId: publication.id,
      sourceAssetId: source.id,
      profileId: "book-fme-v1",
      profileVersion: 1,
      profileSnapshot: null,
      engineVersion: "teste",
      settings: { pageFrom: 1, pageTo: 2, recognizeMath: "never" } as never,
      runKey: "respostas",
      inheritedFromRunId: null,
      pageFrom: 1,
      pageTo: 2,
    });
    await store.updateRun(run.id, { state: "READY_FOR_REVIEW" });

    const proposed = (over: Partial<ProposedItem> & Pick<ProposedItem, "key" | "kind" | "text">): ProposedItem => ({
      parentKey: null,
      originalLabel: null,
      number: null,
      title: null,
      pageNumber: 1,
      printedPage: null,
      regions: [{ pageNumber: 1, role: "PRIMARY", box: { x: 0.1, y: 0.1 + Math.random() * 0.5, width: 0.5, height: 0.05 } }],
      latex: null,
      needsMath: false,
      confidence: 0.9,
      confidenceParts: {},
      evidence: [],
      diagnostic: null,
      metadata: {},
      reviewState: "AUTO_ACCEPTABLE",
      ...over,
    });
    const alternativas = ["a", "b", "c", "d", "e"].map((letra) =>
      proposed({ key: `I:${letra}`, kind: "ITEM", parentKey: "Q:2", number: letra, text: `${letra}) ${letra.toUpperCase()}` }),
    );
    await store.replaceItems(run.id, [
      proposed({ key: "E:1", kind: "EXERCISE", number: "1", originalLabel: "1.", text: "1. Classifique." }),
      proposed({ key: "Q:2", kind: "QUESTION", number: "2", originalLabel: "2.", text: "2. (UF) Qual?", metadata: { questionType: "MULTIPLE_CHOICE" } }),
      ...alternativas,
      proposed({ key: "A:1", kind: "ANSWER", number: "1", originalLabel: "1.", text: "1. a) V\nb) F", pageNumber: 2, metadata: { answersTo: "EXERCISE" } }),
      proposed({ key: "A:2", kind: "ANSWER", number: "2", originalLabel: "2.", text: "2. d", pageNumber: 2, metadata: { answersTo: "QUESTION" } }),
    ]);

    const { summary, skipped } = await approveScan({ store, writer: new PrismaScanApproval() }, { runId: run.id, destinationId: null, includeSuggested: true });

    expect(skipped).toEqual([]);
    expect(summary.answers).toBe(2);
    const questoes = await prisma.question.findMany({
      where: { node: { publicationId: publication.id } },
      select: { answerLatex: true, options: { orderBy: { sortKey: "asc" }, select: { isCorrect: true } } },
      orderBy: { createdAt: "asc" },
    });
    expect(questoes[0]?.answerLatex).toBe("a) V\n\nb) F");
    expect(questoes[1]?.answerLatex).toBe("");
    expect(questoes[1]?.options.map((option) => option.isCorrect)).toEqual([false, false, false, true, false]);
    // A região da resposta fica na questão, com o papel de resposta: a aba Origem mostra de onde veio.
    const ancoras = await prisma.documentNodeAnchor.findMany({ where: { role: "ANSWER" } });
    expect(ancoras).toHaveLength(2);
  });
});
