import { describe, expect, it } from "vitest";

import { zoneOfPage } from "@modules/scan/domain/capture-profile";
import type { PageModel, TextLine } from "@modules/scan/domain/page";
import { captureProfile } from "@modules/scan/domain/profiles";

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
    spans: [{ text, size, fontName: "X", bold, italic: false, math: false, x0: 0, y0: 0, x1: 100, y1: size }],
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

  it("livro sem marco nenhum é uma zona só", () => {
    expect(profile.zones!([page(1, [line("Um livro qualquer")])])).toEqual([{ label: "corpo", from: 1 }]);
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
