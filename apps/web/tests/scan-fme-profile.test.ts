import { describe, expect, it } from "vitest";

import { zoneOfPage } from "@modules/scan/domain/capture-profile";
import type { PageModel, TextLine } from "@modules/scan/domain/page";
import { questionLatex } from "@modules/scan/domain/approval-latex";
import { planApproval } from "@modules/scan/domain/approval-plan";
import { captureProfile } from "@modules/scan/domain/profiles";
import type { ScanItem } from "@modules/scan/domain/scan-item";

/**
 * O perfil da coleção *Fundamentos de Matemática Elementar*, na parte que roda em qualquer
 * máquina: as zonas e o reconhecimento do documento.
 *
 * A estrutura que ele extrai — 10 capítulos, 83 seções, 568 exercícios — é medida contra o PDF
 * real em `scan-corpus.test.ts`, porque é lá que o livro está. Aqui ficam as decisões que não
 * dependem do acervo pessoal: onde cada zona começa, e o que faz um PDF ser desta coleção.
 */

const profile = captureProfile("book-fme-v1")!;

function line(text: string, size = 10, bold = false): TextLine {
  return {
    id: `l-${text.slice(0, 8)}-${size}`,
    pageNumber: 1,
    text,
    spans: [{ text, baseline: size * 0.8, size, fontName: "X", bold, italic: false, math: false, x0: 0, y0: 0, x1: 100, y1: size }],
    size,
    fontName: "X",
    bold,
    italic: false,
    mathRatio: 0,
    x0: 43,
    y0: 100,
    x1: 400,
    y1: 100 + size,
  };
}

const page = (pageNumber: number, texts: readonly TextLine[]): PageModel => ({
  pageNumber,
  width: 595,
  height: 842,
  lines: texts.map((l) => ({ ...l, pageNumber })),
  graphics: [],
  scanned: false,
});

describe("as zonas do Fundamentos", () => {
  /** Um volume em miniatura, com o cabeçalho corrente de cada zona onde ele aparece no livro. */
  const volume: readonly PageModel[] = [
    // O sumário anuncia as zonas — e não pode abri-las: elas começam centenas de páginas depois.
    page(8, [line("Respostas dos exercícios ........................ 270"), line("Questões de vestibulares ........ 313")]),
    page(9, [line("CAPÍTULO I", 28, true), line("Noções de lógica", 31.5, true)]),
    page(100, [line("NOÇÕES DE LÓGICA", 6.7)]),
    page(278, [line("RESPOSTAS DOS EXERCÍCIOS", 6.7), line("Respostas", 31.5, true)]),
    page(300, [line("RESPOSTAS DOS EXERCÍCIOS", 6.7)]),
    page(321, [line("Questões De VestIBuLARes", 6.7)]),
    page(412, [line("REsPOstAs DAs QuEstõEs DE VEstIBuLAREs", 6.7)]),
  ];

  const zones = profile.zones!(volume);

  it("acha as quatro zonas, cada uma na página em que começa", () => {
    expect(zones.map((zone) => [zone.label, zone.from])).toEqual([
      ["corpo", 1],
      ["respostas dos exercícios", 278],
      ["questões de vestibulares", 321],
      ["respostas dos vestibulares", 412],
    ]);
  });

  it("o sumário não abre zona nenhuma", () => {
    // "Respostas dos exercícios ..... 270" traz os pontinhos e o número da página: não é o
    // cabeçalho corrente, é a linha que promete a zona lá adiante.
    expect(zones.find((zone) => zone.label === "respostas dos exercícios")?.from).toBe(278);
  });

  it("os dois gabaritos não são varridos; a zona de vestibular é, com outro tipo de questão", () => {
    const porRotulo = new Map(zones.map((zone) => [zone.label, zone]));
    expect(porRotulo.get("respostas dos exercícios")?.skip).toBe(true);
    expect(porRotulo.get("respostas dos vestibulares")?.skip).toBe(true);
    expect(porRotulo.get("questões de vestibulares")?.skip).toBeUndefined();
    expect(porRotulo.get("questões de vestibulares")?.questionType).toBe("MULTIPLE_CHOICE");
    expect(porRotulo.get("corpo")?.questionType).toBeUndefined();
  });

  it("cada página cai na zona certa, e a zona vale até a véspera da seguinte", () => {
    expect(zoneOfPage(zones, 9)?.label).toBe("corpo");
    expect(zoneOfPage(zones, 277)?.label).toBe("corpo");
    expect(zoneOfPage(zones, 278)?.label).toBe("respostas dos exercícios");
    expect(zoneOfPage(zones, 320)?.label).toBe("respostas dos exercícios");
    expect(zoneOfPage(zones, 321)?.label).toBe("questões de vestibulares");
    expect(zoneOfPage(zones, 411)?.label).toBe("questões de vestibulares");
    expect(zoneOfPage(zones, 420)?.label).toBe("respostas dos vestibulares");
  });

  it("o banner com a letra acentuada mal codificada ainda é o banner", () => {
    // Na p. 117 do vol. 1 a fonte entrega o "Í" como "ê". O bloco não abria, e seis exercícios
    // ficavam invisíveis. A pontuação do perfil usa a mesma regra que a classificação.
    // O corpo do texto precisa estar na página: é contra ele que o banner mede 1,9×.
    const corpo = Array.from({ length: 6 }, (_, i) => line(`${188 + i}. Enunciado de um exercício qualquer.`));
    const amostra = [page(117, [line("E X E R C ê C I O S", 19, true), ...corpo])];
    expect(profile.score(amostra).evidence).toContain("1 banners");
  });

  it("livro sem marco nenhum é uma zona só", () => {
    expect(profile.zones!([page(1, [line("Um livro qualquer")])])).toEqual([{ label: "corpo", from: 1 }]);
  });
});

describe("o que a aprovação faz com o que este livro traz", () => {
  const base = {
    parentKey: null,
    originalLabel: null,
    title: null,
    pageNumber: 330,
    printedPage: null,
    regions: [{ pageNumber: 330, role: "PRIMARY" as const, box: { x: 0.1, y: 0.1, width: 0.5, height: 0.1 } }],
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
    reviewState: "NEEDS_REVIEW" as const,
  };

  const item = (over: Partial<ScanItem> & Pick<ScanItem, "id" | "key" | "kind" | "text">): ScanItem =>
    ({ ...base, number: null, proposed: { kind: over.kind, parentKey: null, title: null, originalLabel: null, number: null, regions: base.regions, text: over.text, latex: null, confidence: 0.9 }, ...over }) as ScanItem;

  /*
    As alternativas de uma questão de múltipla escolha chegam como filhos `ITEM`.

    Na página, "a) 60" é letra, parêntese e recuo — o mesmo que um subitem de exercício
    discursivo. Quem as separa é o tipo da questão. Sem isto, as 359 questões de vestibular do
    volume nasciam MULTIPLE_CHOICE com zero alternativas, e o que devia ser opção virava um
    `enumerate` dentro do enunciado.
  */
  it("os filhos a)…e) viram alternativas quando o tipo pede", () => {
    const questao = item({ id: "q", key: "Q:1", kind: "QUESTION", text: "1. (UF-RS) Quantos são?", number: "1" });
    const filhos = ["a", "b", "c", "d", "e"].map((letra, i) =>
      item({ id: `i${i}`, key: `I:${letra}`, kind: "ITEM", text: `${letra}) ${i * 10}`, number: letra, parentKey: "Q:1" }),
    );

    const { options, statementLatex } = questionLatex(questao, filhos, true);

    expect(options).toEqual(["0", "10", "20", "30", "40"]);
    expect(statementLatex).not.toContain("enumerate");
  });

  it("em ordem de leitura trocada, manda a letra — o livro imprime em duas colunas", () => {
    const questao = item({ id: "q", key: "Q:7", kind: "QUESTION", text: "7. Quantas pessoas?", number: "7" });
    // A ordem em que a coluna dupla entrega: a, c, e de um lado; b, d do outro.
    const filhos = ["a", "c", "e", "b", "d"].map((letra) =>
      item({ id: `i${letra}`, key: `I:${letra}`, kind: "ITEM", text: `${letra}) ${letra.toUpperCase()}`, number: letra, parentKey: "Q:7" }),
    );

    expect(questionLatex(questao, filhos, true).options).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("as cinco numa linha só são separadas pelas letras", () => {
    // O motor lê a linha inteira como **um** item: "a) Ari; água b) Bruna; água …".
    const questao = item({ id: "q", key: "Q:4", kind: "QUESTION", text: "4. Quem pede água?", number: "4" });
    const unico = item({
      id: "i",
      key: "I:a",
      kind: "ITEM",
      number: "a",
      parentKey: "Q:4",
      text: "a) Ari; água b) Bruna; água c) Carlos; suco e) Bruna; suco d) Ari; suco",
    });

    expect(questionLatex(questao, [unico], true).options).toEqual([
      "Ari; água",
      "Bruna; água",
      "Carlos; suco",
      "Ari; suco",
      "Bruna; suco",
    ]);
  });

  it("quando as letras recomeçam, fica o primeiro jogo — o resto é da questão seguinte", () => {
    // A 253 ficava com as alternativas da 254 e da 255, que dividem o enunciado com ela.
    const questao = item({ id: "q", key: "Q:253", kind: "QUESTION", text: "253. Qual o preço?", number: "253" });
    const filhos = ["a) 55", "b) 60", "c) 65", "d) 70", "e) 75", "a) 380", "b) 390"].map((texto, i) =>
      item({ id: `i${i}`, key: `I:${i}`, kind: "ITEM", number: texto[0]!, parentKey: "Q:253", text: texto }),
    );

    expect(questionLatex(questao, filhos, true).options).toEqual(["55", "60", "65", "70", "75"]);
  });

  it("\"(b)\" e \"f(x)\" no meio do texto não são alternativa", () => {
    const questao = item({ id: "q", key: "Q:9", kind: "QUESTION", text: "9. Seja f.", number: "9" });
    const filhos = [
      item({ id: "a", key: "I:a", kind: "ITEM", number: "a", parentKey: "Q:9", text: "a) vale f(x) em (b)" }),
      item({ id: "b", key: "I:b", kind: "ITEM", number: "b", parentKey: "Q:9", text: "b) outra" }),
    ];

    expect(questionLatex(questao, filhos, true).options).toEqual(["vale f(x) em (b)", "outra"]);
  });

  it("num exercício discursivo os mesmos filhos continuam sendo itens", () => {
    const exercicio = item({ id: "e", key: "E:9", kind: "EXERCISE", text: "9. Resolva:", number: "9" });
    const filhos = ["a", "b"].map((letra) =>
      item({ id: `i${letra}`, key: `I:${letra}`, kind: "ITEM", text: `${letra}) conta`, number: letra, parentKey: "E:9" }),
    );

    const { options, statementLatex } = questionLatex(exercicio, filhos, false);

    expect(options).toEqual([]);
    expect(statementLatex).toContain("\\begin{enumerate}");
  });

  it("a resolução impressa sai do enunciado e vai para o campo dela", () => {
    const resolvido = item({
      id: "r",
      key: "E:154",
      kind: "EXERCISE",
      number: "154",
      text: "154. Calcule f(1).\nSolução\nFazendo 3x = 9\nResposta: 5.",
    });

    const { statementLatex, solutionLatex } = questionLatex(resolvido, [], false);

    expect(statementLatex).toContain("Calcule");
    expect(statementLatex).not.toContain("Fazendo");
    expect(solutionLatex).toContain("Fazendo");
    expect(solutionLatex).toContain("Resposta");
  });

  it("e sai também do texto que o reconhecimento devolveu", () => {
    // Neste livro quase todo enunciado passa pela visão, porque a camada de texto perde os
    // símbolos. Se o corte não valesse aqui, a resolução ficaria dentro do enunciado justamente
    // nos itens que mais importam.
    const reconhecido = item({
      id: "r2",
      key: "E:155",
      kind: "EXERCISE",
      number: "155",
      text: "155. original",
      reviewedLatex: "155. Calcule $f(1)$.\nSolução\n$f(1) = 5$",
    });

    const { statementLatex, solutionLatex } = questionLatex(reconhecido, [], false);

    expect(statementLatex).not.toContain("f(1) = 5");
    expect(solutionLatex).toContain("f(1) = 5");
  });
});

describe("múltipla escolha sem alternativa não é múltipla escolha", () => {
  /*
    A zona diz o tipo do trecho, não de cada questão. A seção de vestibulares tem questão de soma
    — "(16)", "(32)", "(64)" — e questão aberta com proposições em romano. Carimbadas múltipla
    escolha, elas eram gravadas com cinco alternativas em branco.
  */
  it("a questão de soma nasce discursiva, com o texto inteiro", () => {
    const soma = {
      id: "q48",
      key: "Q:48",
      kind: "QUESTION" as const,
      parentKey: null,
      originalLabel: null,
      number: "48",
      title: null,
      pageNumber: 330,
      printedPage: null,
      regions: [{ pageNumber: 330, role: "PRIMARY" as const, box: { x: 0.1, y: 0.1, width: 0.5, height: 0.1 } }],
      text: "48. (UFSC) Assinale as corretas.\n(16) Todo múltiplo de 17 é ímpar.\n(32) A soma de dois primos é primo.",
      latex: null,
      needsMath: false,
      confidence: 0.9,
      confidenceParts: {},
      evidence: [],
      diagnostic: null,
      metadata: { questionType: "MULTIPLE_CHOICE" },
      reviewState: "APPROVED" as const,
      sortOrder: 0,
      reviewedText: null,
      reviewedLatex: null,
      proposed: { kind: "QUESTION" as const, parentKey: null, title: null, originalLabel: null, number: "48", regions: [], text: "", latex: null, confidence: 0.9 },
      origin: "SCAN" as const,
      aiDecision: null,
      mathResult: null,
      documentNodeId: null,
      approvedAt: null,
    } as ScanItem;

    const plan = planApproval({
      items: [soma],
      profile: { id: "book-fme-v1", version: 1, defaultQuestionType: "DISCURSIVE" },
      destinationId: null,
      includeSuggested: true,
      existingNodes: [],
      existingAnchors: [],
    });

    const step = plan.steps.find((candidate) => candidate.type === "createNode");
    expect(step && step.type === "createNode" ? step.question?.type : null).toBe("DISCURSIVE");
    expect(step && step.type === "createNode" ? step.question?.statementLatex : "").toContain("(32)");
  });
});

describe("subitem não é alternativa", () => {
  const questao = (filhos: readonly string[]) => {
    const base = {
      parentKey: null,
      originalLabel: null,
      title: null,
      pageNumber: 370,
      printedPage: null,
      regions: [{ pageNumber: 370, role: "PRIMARY" as const, box: { x: 0.1, y: 0.1, width: 0.5, height: 0.1 } }],
      latex: null,
      needsMath: false,
      confidence: 0.9,
      confidenceParts: {},
      evidence: [],
      diagnostic: null,
      reviewState: "APPROVED" as const,
      sortOrder: 0,
      reviewedText: null,
      reviewedLatex: null,
      origin: "SCAN" as const,
      aiDecision: null,
      mathResult: null,
      documentNodeId: null,
      approvedAt: null,
      proposed: { kind: "QUESTION" as const, parentKey: null, title: null, originalLabel: null, number: null, regions: [], text: "", latex: null, confidence: 0.9 },
    };
    const pai = { ...base, id: "q", key: "Q:268", kind: "QUESTION" as const, number: "268", text: "268. (Unifesp) Considere as funções.", metadata: { questionType: "MULTIPLE_CHOICE" } } as ScanItem;
    const itens = filhos.map(
      (texto, i) => ({ ...base, id: `i${i}`, key: `I:${i}`, kind: "ITEM" as const, number: texto[0]!, parentKey: "Q:268", text: texto, metadata: {} }) as ScanItem,
    );
    const plan = planApproval({
      items: [pai, ...itens],
      profile: { id: "book-fme-v1", version: 1, defaultQuestionType: "DISCURSIVE" },
      destinationId: null,
      includeSuggested: true,
      existingNodes: [],
      existingAnchors: [],
    });
    const step = plan.steps.find((candidate) => candidate.type === "createNode");
    return step && step.type === "createNode" ? step.question : null;
  };

  it("\"a) Esboce… b) Calcule…\" é discursiva, e os subitens ficam no enunciado", () => {
    const q = questao(["a) Faça o esboço do gráfico.", "b) Calcule o quociente."]);

    expect(q?.type).toBe("DISCURSIVE");
    expect(q?.options).toEqual([]);
    // O rebaixamento refaz o LaTeX: sem isso os subitens, já tomados como opções, sumiam.
    expect(q?.statementLatex).toContain("Faça o esboço");
    expect(q?.statementLatex).toContain("Calcule o quociente");
  });

  it("sem zona, o tipo do perfil não é rebaixado — o ENEM é todo de múltipla escolha", () => {
    // Alternativas em imagem não têm texto para contar; o perfil do caderno sabe que é múltipla
    // escolha mesmo assim, e é ele quem manda quando a zona não disse nada.
    const plan = planApproval({
      items: [
        {
          id: "e",
          key: "Q:45",
          kind: "QUESTION",
          parentKey: null,
          originalLabel: null,
          number: "45",
          title: null,
          pageNumber: 12,
          printedPage: null,
          regions: [{ pageNumber: 12, role: "PRIMARY", box: { x: 0.1, y: 0.1, width: 0.5, height: 0.1 } }],
          text: "QUESTÃO 45\nObserve os gráficos.",
          latex: null,
          needsMath: false,
          confidence: 0.9,
          confidenceParts: {},
          evidence: [],
          diagnostic: null,
          metadata: {},
          reviewState: "APPROVED",
          sortOrder: 0,
          reviewedText: null,
          reviewedLatex: null,
          proposed: { kind: "QUESTION", parentKey: null, title: null, originalLabel: null, number: "45", regions: [], text: "", latex: null, confidence: 0.9 },
          origin: "SCAN",
          aiDecision: null,
          mathResult: null,
          documentNodeId: null,
          approvedAt: null,
        } as ScanItem,
      ],
      profile: { id: "exam-enem-v1", version: 1, defaultQuestionType: "MULTIPLE_CHOICE" },
      destinationId: null,
      includeSuggested: true,
      existingNodes: [],
      existingAnchors: [],
    });
    const step = plan.steps.find((candidate) => candidate.type === "createNode");
    expect(step && step.type === "createNode" ? step.question?.type : null).toBe("MULTIPLE_CHOICE");
  });

  it("com quatro alternativas é múltipla escolha", () => {
    const q = questao(["a) 50", "b) 51", "c) 60", "d) 61"]);

    expect(q?.type).toBe("MULTIPLE_CHOICE");
    expect(q?.options).toEqual(["50", "51", "60", "61"]);
  });
});

describe("o Fundamentos se reconhece", () => {
  it("o banner com as letras separadas é a impressão digital da coleção", () => {
    const amostra = [
      page(40, [line("E X E R C Í C I O S", 19, true), line("38. Sejam os conjuntos A, B e C.")]),
      page(41, [line("IV. Conjunto universo", 15, true)]),
    ];

    const { score, evidence } = profile.score(amostra);
    expect(score).toBeGreaterThan(0);
    expect(evidence).toContain("banner");
    // E o perfil genérico de livro-texto não vê nada disso: a palavra não existe contígua.
    expect(captureProfile("book-v1")!.score(amostra).score).toBe(0);
  });
});
