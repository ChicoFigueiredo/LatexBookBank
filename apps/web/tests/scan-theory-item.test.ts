import { describe, expect, it } from "vitest";

import { bodyPieceLatex, firstSentence, headingTitle, latexToPlain } from "@modules/scan/domain/approval-latex";
import { planApproval } from "@modules/scan/domain/approval-plan";
import { buildLines, type RawPage, type RawSpan } from "@modules/scan/domain/page";
import { captureProfile } from "@modules/scan/domain/profiles";
import type { ScanItem } from "@modules/scan/domain/scan-item";
import { buildProposal } from "@modules/scan/domain/structure";
import { alreadyRepaired, repairTheoryNode, theoryRepairTargets } from "@modules/scan/domain/theory-item-repair";

/**
 * O item de teoria do *Fundamentos* — "1. Chama-se **proposição** ou **sentença**…" (D76).
 *
 * O motor tratava a linha do número como título, e título sem nome não levava o texto a lugar
 * nenhum: o corpo do nó começava na frase seguinte, e a árvore o chamava de "Questão 1". Foram 73
 * das 159 subseções do vol. 1.
 */

const profile = captureProfile("book-fme-v1")!;
const BODY = 10;
const LEFT = 43;

const span = (text: string, x0: number, baseline: number, extra: Partial<RawSpan> = {}): RawSpan => ({
  text,
  x0,
  x1: x0 + text.length * BODY * 0.5,
  baseline,
  size: BODY,
  fontName: "Times-Roman",
  endsLine: false,
  ...extra,
});

/** Uma linha feita de trechos, um depois do outro, cada um com a sua fonte. */
function line(pieces: readonly (readonly [string, Partial<RawSpan>?])[], baseline: number): RawSpan[] {
  let x = LEFT;
  return pieces.map(([text, extra], index) => {
    const piece = span(text, x, baseline, { ...extra, endsLine: index === pieces.length - 1 });
    x = piece.x1 + 2;
    return piece;
  });
}

const bold = { fontName: "Times-Bold" };

function theoryPage(): RawPage {
  let y = 80;
  const next = (gap = 14) => (y += gap);
  const spans: RawSpan[] = [
    ...line([["I. Proposição", { size: 15, fontName: "Rockwell-Bold" }]], next(0)),
    // O número em 13 pt, o parágrafo emendado logo depois, em 10 pt — e duas palavras em negrito.
    ...line(
      [
        ["1.", { size: 13, fontName: "Rockwell-Bold" }],
        ["Chama-se"],
        ["proposição", bold],
        ["ou"],
        ["sentença", bold],
        ["toda oração declarativa que pode ser clas-"],
      ],
      next(24),
    ),
    ...line([["sificada em verdadeira ou em falsa."]], next()),
    ...line([["Observamos que toda proposição apresenta três características obrigatórias:"]], next()),
    ...line([["sendo oração, tem sujeito e predicado; é declarativa, e não exclamativa;"]], next()),
    ...line([["tem um, e somente um, dos dois valores lógicos: ou é verdadeira ou é falsa."]], next()),
  ];
  return { pageNumber: 9, width: 595, height: 842, spans, graphics: [] };
}

describe("o motor com o item de teoria", () => {
  const proposal = buildProposal([buildLines(theoryPage())], profile);
  const subsecao = proposal.items.find((item) => item.kind === "SUBSECTION");
  const texto = proposal.items.find((item) => item.kind === "CONTENT" && item.parentKey === subsecao?.key);

  it("o parágrafo que emenda no número vai para o texto do item, e não some com o título", () => {
    expect(subsecao?.number).toBe("1");
    expect(texto?.text.split("\n")[0]).toContain("Chama-se proposição ou sentença");
    expect(texto?.metadata["leadLabel"]).toBe("1.");
  });

  it("o texto guarda o que o PDF imprime em negrito, e não o número", () => {
    expect(texto?.metadata["boldPhrases"]).toEqual(["proposição", "sentença"]);
  });

  it("o corpo traz a primeira frase inteira, com o negrito, e sem o número", () => {
    const latex = bodyPieceLatex({ ...texto, reviewedText: null, reviewedLatex: null, mathResult: null } as unknown as ScanItem);
    expect(latex.startsWith(
      "Chama-se \\textbf{proposição} ou \\textbf{sentença} toda oração declarativa que pode ser classificada em verdadeira ou em falsa.",
    )).toBe(true);
  });
});

const base = {
  parentKey: null,
  originalLabel: null,
  title: null,
  number: null,
  pageNumber: 9,
  printedPage: null,
  regions: [{ pageNumber: 9, role: "PRIMARY" as const, box: { x: 0.1, y: 0.1, width: 0.7, height: 0.05 } }],
  latex: null,
  needsMath: false,
  confidence: 0.9,
  confidenceParts: {},
  evidence: [],
  diagnostic: null,
  metadata: {},
  sortOrder: 0,
  reviewedText: null,
  reviewedLatex: null,
  origin: "SCAN" as const,
  aiDecision: null,
  mathResult: null,
  documentNodeId: null,
  approvedAt: null,
  reviewState: "APPROVED" as const,
};

const item = (over: Partial<ScanItem> & Pick<ScanItem, "id" | "key" | "kind" | "text">): ScanItem =>
  ({
    ...base,
    proposed: { kind: over.kind, parentKey: null, title: null, originalLabel: null, number: null, regions: base.regions, text: over.text, latex: null, confidence: 0.9 },
    ...over,
  }) as ScanItem;

const recognized = (latex: string) => ({
  latex,
  confidence: 0.9,
  alternatives: [],
  providerId: "ollama",
  model: "teste",
  durationMs: 1,
  recognizedAt: "2026-11-10T00:00:00.000Z",
});

describe("o título do item de teoria", () => {
  it("é a primeira frase, até o ponto", () => {
    expect(firstSentence("Chama-se proposição toda oração. Observamos que…")).toBe("Chama-se proposição toda oração.");
  });

  it("ou até os dois-pontos, quando a frase anuncia uma lista", () => {
    expect(firstSentence("Há expressões como: a) x + 1 = 7")).toBe("Há expressões como:");
  });

  it("não para no ponto de um número decimal nem de uma abreviação colada", () => {
    expect(firstSentence("O valor 2.5 é racional, e o resto segue. Depois")).toBe("O valor 2.5 é racional, e o resto segue.");
  });

  it("sai do texto reconhecido, com o símbolo que a camada de texto perdia", () => {
    expect(latexToPlain("Quando $A \\subset B$, também podemos escrever $B \\supset A$.")).toBe(
      "Quando A ⊂ B, também podemos escrever B ⊃ A.",
    );
    expect(latexToPlain("indicada com o símbolo $\\sim p$, e \\textbf{negação} de $p$")).toBe(
      "indicada com o símbolo ~p, e negação de p",
    );
  });

  /** Um título da proposta com o buraco que a camada de texto deixa — o caractere da área privada. */
  const comBuraco = (title: string, latex: string, label = "3.") => {
    const cabecalho = item({ id: "h", key: `S:${label}`, kind: "SUBSECTION", text: `${label} ${title}`, title, number: label.slice(0, -1), originalLabel: label, needsMath: true, mathResult: recognized(latex) });
    // O título que a proposta trouxe — a pessoa não o mudou na revisão.
    return { ...cabecalho, proposed: { ...cabecalho.proposed, title } } as ScanItem;
  };

  it("o título com nome que perdeu o símbolo ganha o símbolo do reconhecimento, sem o rótulo", () => {
    expect(headingTitle(comBuraco("Conectivo \uE060", "3. Conectivo $\\land$"), null)).toBe("Conectivo ∧");
    expect(headingTitle(comBuraco("Equação √f(x) \uE035 g(x)", "Equação $\\sqrt{f(x)} = g(x)$"), null)).toBe("Equação √f(x) = g(x)");
    expect(headingTitle(comBuraco("Equação 3√f(x) \uE035 g(x)", "Equação $\\sqrt[3]{f(x)} = g(x)$"), null)).toBe("Equação 3√f(x) = g(x)");
    // O buraco que a fonte entrega como caractere de controle (item 158 do vol. 1).
    expect(headingTitle(comBuraco("Inequação irracional √f(x) \u0001 g(x)", "Inequação irracional $\\sqrt{f(x)} > g(x)$"), null)).toBe(
      "Inequação irracional √f(x) > g(x)",
    );
  });

  it("do reconhecimento sai só o símbolo — o que o modelo inventa depois fica de fora", () => {
    // No vol. 1 o modelo escreveu um parágrafo inteiro depois de "Operações em ℤ".
    const inventado = "Operações em $\\mathbb{Z}$ A adição e a multiplicação de dois números inteiros são operações.";
    expect(headingTitle(comBuraco("Operações em \uE05A", inventado, "43."), null)).toBe("Operações em ℤ");
  });

  it("sem encaixe exato, o título fica como estava", () => {
    // O modelo leu outra coisa no lugar: uma palavra não é símbolo.
    const titulo = "Conectivo \uE060";
    expect(headingTitle(comBuraco(titulo, "Conectivo e"), null)).toBe(titulo);
    expect(headingTitle(comBuraco(titulo, "Outra coisa"), null)).toBe(titulo);
  });

  it("título legível não muda, mesmo com matemática e com reconhecimento", () => {
    // "Condicional →": a seta a camada de texto lê; o modelo acrescentava "P → Q".
    expect(headingTitle(comBuraco("Condicional →", "Condicional → P → Q", "5."), null)).toBe("Condicional →");
  });

  it("na aprovação, a subseção sem nome ganha a primeira frase por título", () => {
    const cabecalho = item({ id: "h", key: "S:1", kind: "SUBSECTION", text: "1. Chama-se", number: "1", originalLabel: "1." });
    const texto = item({
      id: "c",
      key: "C:1",
      kind: "CONTENT",
      parentKey: "S:1",
      sortOrder: 1,
      text: "1. Chama-se proposição ou sentença toda oração declarativa.\nObservamos que…",
      needsMath: true,
      metadata: { leadLabel: "1.", boldPhrases: ["proposição", "sentença"] },
      mathResult: recognized("\\textbf{1.} Chama-se proposição ou sentença toda oração declarativa.\n\nObservamos que…"),
    });

    const plan = planApproval({
      items: [cabecalho, texto],
      profile: { id: "book-fme-v1", version: 1, defaultQuestionType: "DISCURSIVE" },
      destinationId: "book",
      includeSuggested: false,
      existingNodes: [],
      existingAnchors: [],
    });

    const node = plan.steps.find((step) => step.type === "createNode");
    const corpo = plan.steps.find((step) => step.type === "appendBody");
    expect(node && "title" in node ? node.title : null).toBe("Chama-se proposição ou sentença toda oração declarativa.");
    expect(corpo && "latex" in corpo ? corpo.latex : null).toBe(
      "Chama-se \\textbf{proposição} ou \\textbf{sentença} toda oração declarativa.\n\nObservamos que…",
    );
  });
});

describe("o conserto do vol. 1 já aprovado", () => {
  const novoCabecalho = item({ id: "", key: "SUBSECTION:9:a", kind: "SUBSECTION", text: "1. Chama-se", originalLabel: "1.", number: "1" });
  const novoTexto = item({
    id: "",
    key: "CONTENT:9:a",
    kind: "CONTENT",
    parentKey: "SUBSECTION:9:a",
    text: "1. Chama-se proposição ou sentença toda oração declarativa.\nObservamos que…",
    needsMath: true,
    metadata: { leadLabel: "1.", boldPhrases: ["proposição", "sentença"] },
  });
  const velhoCabecalho = item({ id: "h-old", key: "SUBSECTION:9:old", kind: "SUBSECTION", text: "1. Chama-se", originalLabel: "1.", number: "1", documentNodeId: "no-1" });
  const velhoTexto = item({
    id: "c-old",
    key: "CONTENT:9:old",
    kind: "CONTENT",
    parentKey: "SUBSECTION:9:old",
    text: "sificada em verdadeira ou em falsa.\nObservamos que…",
    needsMath: true,
    documentNodeId: "no-1",
    mathResult: recognized("Observamos que…"),
  });
  const leitura = recognized("1. Chama-se proposição ou sentença toda oração declarativa.\n\nObservamos que…");

  it("acha a subseção sem título que agora tem texto emendado", () => {
    const [alvo, ...resto] = theoryRepairTargets([velhoCabecalho, velhoTexto], [novoCabecalho, novoTexto]);
    expect(resto).toEqual([]);
    expect(alvo).toMatchObject({ nodeId: "no-1", reason: "untitled" });
    expect(alvo?.oldLead?.id).toBe("c-old");
  });

  it("troca o começo do corpo pelo parágrafo inteiro, e dá o título", () => {
    const [alvo] = theoryRepairTargets([velhoCabecalho, velhoTexto], [novoCabecalho, novoTexto]);
    const conserto = repairTheoryNode(alvo!, { id: "no-1", title: null, bodyLatex: "Observamos que…\n\nDepois, uma figura." }, { lead: leitura, heading: null });

    expect(conserto).toMatchObject({
      title: "Chama-se proposição ou sentença toda oração declarativa.",
      bodyLatex: "Chama-se \\textbf{proposição} ou \\textbf{sentença} toda oração declarativa.\n\nObservamos que…\n\nDepois, uma figura.",
    });
  });

  it("rodar de novo não muda nada — o item antigo passa a descrever o trecho novo", () => {
    const [alvo] = theoryRepairTargets([velhoCabecalho, velhoTexto], [novoCabecalho, novoTexto]);
    const primeiro = repairTheoryNode(alvo!, { id: "no-1", title: null, bodyLatex: "Observamos que…" }, { lead: leitura, heading: null });
    if (!("bodyLatex" in primeiro) || primeiro.leadUpdate === null) throw new Error("devia consertar");

    const [deNovo] = theoryRepairTargets([velhoCabecalho, primeiro.leadUpdate], [novoCabecalho, novoTexto]);
    const segundo = repairTheoryNode(deNovo!, { id: "no-1", title: primeiro.title, bodyLatex: primeiro.bodyLatex }, { lead: leitura, heading: null });
    expect(segundo).toMatchObject({ title: primeiro.title, bodyLatex: primeiro.bodyLatex });
  });

  it("acha o trecho antigo depois da figura, e gravado com o símbolo cru", () => {
    // Itens 28 e 38 do vol. 1: a figura do lado do item entra antes do texto, e a aprovação da
    // época gravava "x ∈ A", que o LaTeX de hoje escreve "x $\\in$ A".
    const cru = { ...velhoTexto, mathResult: recognized("Observamos que x ∈ A…") } as ScanItem;
    const [alvo] = theoryRepairTargets([velhoCabecalho, cru], [novoCabecalho, novoTexto]);
    const corpo = "\\begin{figure}[H]\n\\end{figure}\n\nObservamos que x ∈ A…";

    const conserto = repairTheoryNode(alvo!, { id: "no-1", title: null, bodyLatex: corpo }, { lead: leitura, heading: null });

    expect(conserto).toMatchObject({
      bodyLatex:
        "\\begin{figure}[H]\n\\end{figure}\n\nChama-se \\textbf{proposição} ou \\textbf{sentença} toda oração declarativa.\n\nObservamos que…",
    });
  });

  it("o nó já consertado não volta ao modelo, que não responde igual duas vezes", () => {
    const [alvo] = theoryRepairTargets([velhoCabecalho, velhoTexto], [novoCabecalho, novoTexto]);
    expect(alreadyRepaired(alvo!, { id: "no-1", title: null, bodyLatex: "Observamos que…" })).toBe(false);

    const primeiro = repairTheoryNode(alvo!, { id: "no-1", title: null, bodyLatex: "Observamos que…" }, { lead: leitura, heading: null });
    if (!("bodyLatex" in primeiro) || primeiro.leadUpdate === null) throw new Error("devia consertar");
    const [deNovo] = theoryRepairTargets([velhoCabecalho, primeiro.leadUpdate], [novoCabecalho, novoTexto]);
    expect(alreadyRepaired(deNovo!, { id: "no-1", title: primeiro.title, bodyLatex: primeiro.bodyLatex })).toBe(true);
  });

  it("pula o corpo que alguém editou depois da aprovação", () => {
    const [alvo] = theoryRepairTargets([velhoCabecalho, velhoTexto], [novoCabecalho, novoTexto]);
    const conserto = repairTheoryNode(alvo!, { id: "no-1", title: null, bodyLatex: "Texto reescrito à mão." }, { lead: leitura, heading: null });
    expect(conserto).toMatchObject({ skipped: expect.stringContaining("editado") });
  });
});
