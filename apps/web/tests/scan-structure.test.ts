import { beforeAll, describe, expect, it, vi } from "vitest";

import { segmentarPagina, type PaginaDeTexto } from "@modules/recognition/domain/segmentar-pagina";
import { assembleDocument } from "@modules/scan/domain/document";
import { buildLines } from "@modules/scan/domain/page";
import { captureProfile, registeredCaptureProfiles } from "@modules/scan/domain/profiles";
import { toPaginaDeTexto } from "@modules/scan/domain/profiles/exam-v1";
import type { Proposal, ProposedItem, ScanKind } from "@modules/scan/domain/proposal";
import { buildProposal } from "@modules/scan/domain/structure";

import ena from "./fixtures/profmat-ena-2023-p1-p2.json";
import { fixturePages } from "./support/scan-fixtures";

// Lê PDF de verdade e, em alguns casos, monta um SQLite com as migrações: sozinho leva um ou dois
// segundos, e com a suíte inteira em paralelo passa dos 5 s padrão. Limite explícito, não sorte.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * O motor e os perfis contra as fixtures sintéticas (§52–§55 do prompt 03). Cada `describe` é um
 * dos casos obrigatórios do prompt; o nome do teste diz o que o caso exige.
 */

async function propose(file: string, profileId: string): Promise<Proposal> {
  const profile = captureProfile(profileId);
  if (!profile) throw new Error(`perfil ${profileId} não registrado`);
  return buildProposal(await fixturePages(file), profile);
}

const ofKind = (proposal: Proposal, kind: ScanKind) => proposal.items.filter((i) => i.kind === kind);

function parentOf(proposal: Proposal, item: ProposedItem): ProposedItem | undefined {
  return proposal.items.find((candidate) => candidate.key === item.parentKey);
}

function outline(proposal: Proposal): string[] {
  const depth = new Map<string, number>();
  return proposal.items
    .filter((item) => item.kind !== "CONTENT")
    .map((item) => {
      const d = item.parentKey ? (depth.get(item.parentKey) ?? 0) + 1 : 0;
      depth.set(item.key, d);
      return `${"  ".repeat(d)}${item.kind} ${item.number ?? ""}`.trimEnd();
    });
}

describe("registro de perfis", () => {
  it("os três perfis estão registrados, com id e versão", () => {
    expect(registeredCaptureProfiles().map((p) => `${p.id}@${p.version}`).sort()).toEqual([
      "book-v1@1",
      "exam-enem-v1@1",
      "exam-v1@1",
    ]);
  });
});

describe("Livro A — capítulo, seção, texto, exemplo e exercício", () => {
  let proposal: Proposal;
  beforeAll(async () => {
    proposal = await propose("book-a.pdf", "book-v1");
  });

  it("a hierarquia sai inteira, sem IA", () => {
    expect(outline(proposal)).toEqual([
      "CHAPTER 1",
      "  SECTION 1.1",
      "    EXAMPLE 1",
      "    SUBSECTION 1.1.1",
      "      EXAMPLE 2",
      "      EXERCISE_GROUP",
      "        EXERCISE 1",
      "        EXERCISE 2",
      "          ITEM a",
      "          ITEM b",
      "        EXERCISE 3",
      "  SECTION 1.2",
      "    EXERCISE_GROUP",
      "      EXERCISE 1",
      "      EXERCISE 2",
    ]);
  });

  it("o capítulo tem título, e o texto depois do exemplo volta a ser teoria", () => {
    expect(ofKind(proposal, "CHAPTER")[0]?.title).toBe("Funções");
    const texts = ofKind(proposal, "CONTENT").map((item) => item.text.split("\n")[0]);
    expect(texts).toContain("Toda função linear satisfaz f(x+y) = f(x) +f(y), o que se verifica diretamente da definição.");
    const example = ofKind(proposal, "EXAMPLE")[0];
    // O exemplo leva a resolução junto (D56): o segundo parágrafo é dele, e o parágrafo de teoria
    // que vem depois — separado pelo espaço que o ambiente abre — não é.
    expect(example?.text).toContain("A função f(x) = 3x é linear, e f(2) = 6.");
    expect(example?.text).toContain("Este segundo parágrafo é a resolução do exemplo");
    expect(example?.text).not.toContain("Toda função linear satisfaz");
  });

  it("todo elemento tem confiança e pelo menos uma âncora", () => {
    for (const item of proposal.items) {
      expect(item.confidence, item.key).toBeGreaterThan(0);
      expect(item.regions.length, item.key).toBeGreaterThan(0);
    }
  });
});

describe("Livro B — parte, capítulo, subseção e lista de exercícios", () => {
  it("a parte contém o capítulo, e a lista pertence à subseção em que aparece", async () => {
    const proposal = await propose("book-b.pdf", "book-v1");
    expect(outline(proposal)).toEqual([
      "PART 1",
      "  CHAPTER 1",
      "    SECTION 1.1",
      "      SUBSECTION 1.1.1",
      "      SUBSECTION 1.1.2",
      "        EXERCISE_GROUP",
      "          EXERCISE 1",
      "          EXERCISE 2",
      "          EXERCISE 3",
      "PART 2",
      "  CHAPTER 2",
      "    SECTION 2.1",
      "      EXERCISE_GROUP",
      "        EXERCISE 1",
      "        EXERCISE 2",
    ]);
    expect(ofKind(proposal, "PART").map((p) => p.title)).toEqual(["Álgebra", "Geometria"]);
    expect(ofKind(proposal, "EXERCISE_GROUP").map((g) => g.title)).toEqual([
      "Lista de exercícios",
      "Exercícios propostos",
    ]);
  });
});

describe("Livro C — o exercício que vira a página", () => {
  it("é UM exercício com DUAS âncoras, não dois exercícios", async () => {
    const proposal = await propose("book-c.pdf", "book-v1");
    const exercises = ofKind(proposal, "EXERCISE");
    expect(exercises.map((e) => e.number)).toEqual(["1", "2", "3"]);

    const second = exercises[1];
    expect(second?.regions.map((r) => [r.pageNumber, r.role])).toEqual([
      [2, "PRIMARY"],
      [3, "CONTINUATION"],
    ]);
    // Os itens da página seguinte continuam sendo dele.
    const items = ofKind(proposal, "ITEM").filter((item) => item.parentKey === second?.key);
    expect(items.map((item) => `${item.number}@${item.pageNumber}`)).toEqual([
      "a@2",
      "b@2",
      "c@3",
      "d@3",
      "e@3",
      "f@3",
    ]);
    // A mobília (cabeçalho corrido, número de página) não vaza para o texto.
    expect(second?.text).not.toMatch(/CAPÍTULO/);
    expect(proposal.metrics.multiPage).toBe(1);
  });
});

describe("colunas — duas, uma, duas", () => {
  it("cada página decide o próprio layout, e a ordem de leitura é a dos parágrafos", async () => {
    const pages = await fixturePages("colunas.pdf");
    const doc = assembleDocument(pages);

    const columnsPerPage = [1, 2, 3].map((page) => doc.slots.filter((s) => s.pageNumber === page).length);
    expect(columnsPerPage).toEqual([2, 1, 2]);

    const order = doc.lines
      .map((line) => /^Parágrafo (\d+)\./.exec(line.text)?.[1])
      .filter((n): n is string => n !== undefined)
      .map(Number);
    expect(order).toEqual(Array.from({ length: 29 }, (_, i) => i + 1));
  });
});

describe("fórmulas", () => {
  it("o que tem matemática pede reconhecimento; o texto puro sai em LaTeX direto", async () => {
    const proposal = await propose("formulas.pdf", "book-v1");
    const content = ofKind(proposal, "CONTENT")[0];
    const exercise = ofKind(proposal, "EXERCISE")[0];
    expect(content?.needsMath).toBe(true);
    expect(content?.latex).toBeNull();
    expect(exercise?.needsMath).toBe(true);

    const book = await propose("book-b.pdf", "book-v1");
    const prose = ofKind(book, "CONTENT").find((item) => item.text.startsWith("Dois triângulos"));
    expect(prose?.needsMath).toBe(false);
    expect(prose?.latex).toContain("Dois triângulos são semelhantes");
  });
});

describe("livro sintético — sumário, páginas iniciais e mobília", () => {
  let proposal: Proposal;
  beforeAll(async () => {
    proposal = await propose("livro-sintetico.pdf", "book-v1");
  });

  it("o sumário não vira estrutura, e confere a que o scan achou", () => {
    const chapters = ofKind(proposal, "CHAPTER");
    expect(chapters.map((c) => `${c.number} ${c.title}`)).toEqual(["1 Números reais", "2 Derivadas"]);
    expect(chapters.every((c) => c.evidence.some((e) => e.startsWith("o sumário cita")))).toBe(true);
    expect(proposal.items.some((item) => item.pageNumber === 2)).toBe(false);
    expect(proposal.warnings).toEqual([]);
  });

  it("a página impressa é a do livro, não a do PDF", () => {
    expect(proposal.pageOffset).toBe(2);
    const chapter = ofKind(proposal, "CHAPTER")[0];
    expect([chapter?.pageNumber, chapter?.printedPage]).toEqual([4, "2"]);
  });

  it("o exercício longo atravessa a página e continua um só", () => {
    const long = ofKind(proposal, "EXERCISE").find((item) => item.text.startsWith("2. Este parágrafo"));
    expect(long?.regions.map((r) => r.pageNumber)).toEqual([5, 6]);
  });

  it("as partes contêm os capítulos", () => {
    for (const chapter of ofKind(proposal, "CHAPTER")) {
      expect(parentOf(proposal, chapter)?.kind).toBe("PART");
    }
  });
});

describe("ENEM sintético", () => {
  let proposal: Proposal;
  const question = (identity: string) =>
    ofKind(proposal, "QUESTION").find((q) => q.metadata["identity"] === identity);

  beforeAll(async () => {
    proposal = await propose("enem-sintetico.pdf", "exam-enem-v1");
  });

  it("acha as onze questões, e inglês e espanhol não se confundem", () => {
    expect(ofKind(proposal, "QUESTION").map((q) => q.metadata["identity"])).toEqual([
      "inglês#1",
      "inglês#2",
      "espanhol#1",
      "espanhol#2",
      "6",
      "136",
      "137",
      "138",
      "139",
      "140",
      "141",
    ]);
  });

  it("a capa não entra, e a 06 sai do bloco de língua mas fica na área", () => {
    expect(proposal.items.some((item) => item.pageNumber === 1)).toBe(false);
    const q6 = question("6");
    expect(parentOf(proposal, q6!)?.title).toBe("LINGUAGENS, CÓDIGOS E SUAS TECNOLOGIAS");
  });

  it("a última questão da área não engole o marco da próxima", () => {
    const q6 = question("6");
    expect(q6?.regions).toHaveLength(1);
    expect(q6?.diagnostic?.status).toBe("complete");
  });

  it("gráfico, coluna e página aparecem no diagnóstico", () => {
    expect(question("137")?.diagnostic?.facts["hasGraphic"]).toBe(true);
    expect(question("138")?.diagnostic?.facts["crossesPage"]).toBe(true);
    expect(question("138")?.regions.map((r) => r.pageNumber)).toEqual([2, 3]);
    expect(question("139")?.diagnostic?.facts["crossesColumn"]).toBe(true);
    expect(question("139")?.diagnostic?.facts["crossesPage"]).toBe(false);
  });

  it("todas completas: alternativas A–E, cabeçalho dentro, nenhuma invasão", () => {
    for (const q of ofKind(proposal, "QUESTION")) {
      expect(q.diagnostic?.status, `${q.metadata["identity"]}: ${q.diagnostic?.reasons.join("; ")}`).toBe("complete");
    }
    expect(question("140")?.diagnostic?.facts["alternativesFound"]).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("a última questão não desce até o pé da página vazia", () => {
    const last = question("141");
    expect(last?.regions[0]?.box.height).toBeLessThan(0.2);
  });
});

describe("exam-v1 — a segmentação da captura, sem mudança", () => {
  it("dá as mesmas caixas que `segmentarPagina` nas páginas reais do ENA", () => {
    for (const [index, original] of (ena as PaginaDeTexto[]).entries()) {
      const page = buildLines({
        pageNumber: index + 1,
        width: original.largura,
        height: original.altura,
        spans: original.palavras.map((word) => ({
          text: word.texto,
          x0: word.x,
          x1: word.x + word.largura,
          baseline: word.y + word.altura,
          size: word.altura,
          fontName: "Regular",
          endsLine: false,
        })),
        graphics: [],
      });

      const expected = segmentarPagina(original);
      const actual = segmentarPagina(toPaginaDeTexto(page));
      expect(actual.map((q) => q.numero)).toEqual(expected.map((q) => q.numero));
      actual.forEach((q, i) => {
        const e = expected[i]!;
        expect(q.box.x).toBeCloseTo(e.box.x, 4);
        expect(q.box.y).toBeCloseTo(e.box.y, 4);
        expect(q.box.height).toBeCloseTo(e.box.height, 4);
      });
    }
  });
});
