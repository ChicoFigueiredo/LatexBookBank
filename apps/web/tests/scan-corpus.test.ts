import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { buildLines, type PageModel } from "@modules/scan/domain/page";
import type { DocumentZone } from "@modules/scan/domain/capture-profile";
import { captureProfile, rankProfiles } from "@modules/scan/domain/profiles";
import { samplePageNumbers } from "@modules/scan/application/suggest-profile";
import type { Proposal } from "@modules/scan/domain/proposal";
import { buildProposal } from "@modules/scan/domain/structure";
import { PdfjsDocumentReader } from "@modules/scan/infrastructure/pdfjs-document-reader";

/**
 * O scan contra o corpus real (§57, §58 e Fase 10 do prompt 03 · D48).
 *
 * Os PDFs são de consumo pessoal e ficam fora do git; a lista é um JSON apontado por
 * `SCAN_CORPUS`. Sem ele, o teste é pulado — e ele não roda em todo `bun run test`: são centenas
 * de páginas. Para medir e regravar o relatório:
 *
 *     SCAN_REPORT=1 bunx vitest run tests/scan-corpus.test.ts
 *
 * (com `SCAN_REPORT`, o caminho é lido do `.env.local` quando não vem do ambiente).
 */

interface CorpusEntry {
  readonly label: string;
  readonly profile: string;
  readonly path: string;
  readonly expectedQuestions?: number;
}

const root = fileURLToPath(new URL("..", import.meta.url));

function corpusPath(): string | null {
  const direct = process.env["SCAN_CORPUS"];
  if (direct) return path.resolve(root, direct);
  if (!process.env["SCAN_REPORT"]) return null;
  const envFile = path.join(root, ".env.local");
  if (!existsSync(envFile)) return null;
  const line = readFileSync(envFile, "utf8")
    .split("\n")
    .find((entry) => entry.startsWith("SCAN_CORPUS="));
  const value = line?.slice("SCAN_CORPUS=".length).replace(/^"|"$/g, "");
  return value ? path.resolve(root, value) : null;
}

const manifest = corpusPath();
const entries: CorpusEntry[] = manifest && existsSync(manifest) ? (JSON.parse(readFileSync(manifest, "utf8")) as CorpusEntry[]) : [];

interface Measured {
  readonly entry: CorpusEntry;
  readonly available: boolean;
  readonly pages: number;
  readonly ms: number;
  readonly proposal: Proposal | null;
  /** As primeiras páginas, do tamanho que a tela amostra: é o que a sugestão enxergaria. */
  readonly sample: readonly PageModel[];
  /** As zonas que o perfil achou neste documento (ADR 0009); vazio quando ele não declara nenhuma. */
  readonly zones: readonly DocumentZone[];
}

async function measure(entry: CorpusEntry): Promise<Measured> {
  const file = path.resolve(root, entry.path);
  if (!existsSync(file)) return { entry, available: false, pages: 0, ms: 0, proposal: null, sample: [], zones: [] };

  const started = performance.now();
  const pdf = await new PdfjsDocumentReader().open(new Uint8Array(readFileSync(file)));
  const pages: PageModel[] = [];
  try {
    for (let page = 1; page <= pdf.pageCount; page++) pages.push(buildLines(await pdf.readPage(page)));
  } finally {
    await pdf.close();
  }
  const profile = captureProfile(entry.profile);
  if (!profile) throw new Error(`perfil ${entry.profile} não registrado`);
  const proposal = buildProposal(pages, profile);
  return {
    entry,
    available: true,
    pages: pages.length,
    ms: Math.round(performance.now() - started),
    proposal,
    // A mesma amostra que a tela usa — espalhada, não as primeiras (ADR 0007).
    zones: profile.zones?.(pages) ?? [],
    sample: samplePageNumbers(pages.length).flatMap((n) => {
      const page = pages[n - 1];
      return page ? [page] : [];
    }),
  };
}

const questions = (proposal: Proposal) => proposal.items.filter((item) => item.kind === "QUESTION");

function examRow(measured: Measured): string {
  const { entry, proposal } = measured;
  if (!proposal) return `| ${entry.label} | — | não encontrado nesta máquina | | | | | | | |`;
  const found = questions(proposal);
  const status = (name: string) => found.filter((q) => q.diagnostic?.status === name).length;
  const invaded = found.filter((q) => ((q.diagnostic?.facts["otherQuestionInside"] as string[] | undefined) ?? []).length > 0).length;
  const missing = found.filter((q) => ((q.diagnostic?.facts["alternativesMissing"] as string[] | undefined) ?? []).length > 0).length;
  const multiColumn = found.filter((q) => q.diagnostic?.facts["crossesColumn"] === true || q.regions.length > 1).length;
  const multiPage = found.filter((q) => new Set(q.regions.map((r) => r.pageNumber)).size > 1).length;
  const language = found.filter((q) => q.metadata["language"] !== undefined).length;
  return `| ${entry.label} | ${measured.pages} | ${found.length} / ${entry.expectedQuestions ?? "?"} | ${status("complete")} | ${status("suspicious")} | ${status("incomplete")} | ${status("insufficient_evidence")} | ${invaded} | ${missing} | ${multiColumn} | ${multiPage} | ${language} | ${(measured.ms / 1000).toFixed(1)} s |`;
}

function enemSummary(measured: readonly Measured[]): string {
  if (measured.length === 0) return "";
  const all = measured.flatMap((r) => questions(r.proposal!));
  const expected = measured.reduce((sum, r) => sum + (r.entry.expectedQuestions ?? 0), 0);
  const complete = all.filter((q) => q.diagnostic?.status === "complete").length;
  const imageOnly = all.filter((q) => q.diagnostic?.status === "insufficient_evidence").length;
  const invaded = all.filter((q) => ((q.diagnostic?.facts["otherQuestionInside"] as string[] | undefined) ?? []).length > 0).length;
  const pct = (n: number) => `${((n / Math.max(1, all.length)) * 100).toFixed(1).replace(".", ",")}%`;
  return [
    `**No total**: ${all.length} de ${expected} questões localizadas em ${measured.length} cadernos; ${complete} completas`,
    `(${pct(complete)}), ${imageOnly} com alternativas sem texto (em imagem, ${pct(imageOnly)}) e ${invaded} invasões.`,
    "A referência é o segmentador do TRI, que chegou a 98,3% de completas e zero invasões em 2.775",
    "questões de 30 cadernos (auditoria de 2026-09-06).",
  ].join(" ");
}

function bookSection(measured: Measured): string {
  const { entry, proposal } = measured;
  if (!proposal) return `### ${entry.label}\n\nPDF não encontrado nesta máquina.\n`;
  const kinds = proposal.metrics.byKind;
  const k = (name: keyof typeof kinds) => kinds[name] ?? 0;
  const needsMath = proposal.items.filter((item) => item.needsMath).length;
  const suggested = proposal.items.filter((item) => item.reviewState === "AUTO_ACCEPTABLE").length;
  const chapters = proposal.items
    .filter((item) => item.kind === "CHAPTER")
    .slice(0, 12)
    .map((item) => `${item.number ?? "?"} ${item.title ?? ""} (p. ${item.pageNumber})`)
    .join(" · ");
  return [
    `### ${entry.label}`,
    "",
    "| Medida | Valor |",
    "|---|---:|",
    `| páginas analisadas | ${measured.pages} |`,
    `| elementos encontrados | ${proposal.metrics.items} |`,
    `| partes · capítulos · seções · subseções | ${k("PART")} · ${k("CHAPTER")} · ${k("SECTION")} · ${k("SUBSECTION")} |`,
    `| exemplos | ${k("EXAMPLE")} |`,
    `| blocos de exercícios · exercícios · itens | ${k("EXERCISE_GROUP")} · ${k("EXERCISE")} · ${k("ITEM")} |`,
    `| trechos de teoria | ${k("CONTENT")} |`,
    `| figuras | ${k("FIGURE")} |`,
    `| âncoras · itens com mais de uma · que atravessam página | ${proposal.metrics.regions} · ${proposal.metrics.multiRegion} · ${proposal.metrics.multiPage} |`,
    `| baixa confiança (< 0,70) | ${proposal.metrics.lowConfidence} |`,
    `| sugeridos para aprovação em lote | ${suggested} |`,
    `| precisam de reconhecimento matemático | ${needsMath} |`,
    `| deslocamento PDF − impressa | ${proposal.pageOffset ?? "não medido"} |`,
    `| avisos | ${proposal.warnings.length} |`,
    `| chamadas à IA · ao reconhecimento | 0 · 0 (medição determinística) |`,
    `| tempo | ${(measured.ms / 1000).toFixed(1)} s |`,
    "",
    chapters ? `Capítulos achados: ${chapters}.` : "Nenhum capítulo achado.",
    "",
    ...(proposal.warnings.length > 0 ? ["Avisos:", "", ...proposal.warnings.slice(0, 8).map((w) => `- ${w}`), ""] : []),
  ].join("\n");
}

describe.skipIf(entries.length === 0)("corpus real do scan", () => {
  const results: Measured[] = [];

  it("mede cada PDF do corpus", { timeout: 1_800_000 }, async () => {
    for (const entry of entries) results.push(await measure(entry));
    expect(results.some((result) => result.available)).toBe(true);
  });

  it("as provas do ENEM: nenhuma questão invade outra", () => {
    for (const result of results.filter((r) => r.proposal && r.entry.profile === "exam-enem-v1")) {
      const invaded = questions(result.proposal!).filter(
        (q) => ((q.diagnostic?.facts["otherQuestionInside"] as string[] | undefined) ?? []).length > 0,
      );
      expect(invaded.map((q) => q.metadata["identity"]), result.entry.label).toEqual([]);
    }
  });

  /*
    A sugestão de perfil, contra os PDFs de verdade (ADR 0007).

    O sintético prova que a conta funciona; só o caderno real prova que ela serve. A amostra é a
    mesma que a tela usa — oito páginas —, e o manifesto já diz qual perfil cada PDF pede, então
    o corpus responde de graça se o palpite acerta.
  */
  it("o palpite de perfil acerta o que o manifesto diz", () => {
    for (const result of results.filter((r) => r.proposal !== null)) {
      const sample = result.pages > 0 ? result.sample : [];
      if (sample.length === 0) continue;
      const ranking = rankProfiles(sample);
      expect(ranking[0]?.id, `${result.entry.label} — ${ranking.map((r) => `${r.id}:${r.score.toFixed(2)}`).join(" ")}`).toBe(
        result.entry.profile,
      );
    }
  });

  /*
    O aceite da Fase 25: o *Fundamentos* lido pelo perfil da coleção.

    Os números são do vol. 1 e vêm do livro, não da implementação: 10 capítulos e 83 seções estão
    no sumário, os itens de teoria vão de 1 a 159 e os exercícios de 1 a 568. O que se afirma aqui
    é o que o `book-v1` não conseguia — ele achava 0 exercícios, 0 exemplos e 453 falsas seções.
  */
  it("o Fundamentos: a estrutura do livro, e nada vindo dos gabaritos", () => {
    /*
      O `return` é para a máquina que não tem este PDF — o corpus é pessoal e fica fora do git.
      Mas se o manifesto **pede** o perfil e o arquivo está lá, o aceite tem de rodar: sem esta
      distinção, o dia em que a entrada sumisse do manifesto o aceite passaria calado.
      */
    const pedido = entries.some((entry) => entry.profile === "book-fme-v1");
    const fme = results.find((r) => r.entry.profile === "book-fme-v1" && r.proposal !== null);
    if (!pedido) return;
    expect(fme, "o manifesto pede book-fme-v1, e a medição não chegou").toBeDefined();
    if (!fme) return;
    const items = fme.proposal!.items;
    const count = (kind: string) => items.filter((item) => item.kind === kind).length;

    // Os números são os medidos, não pisos frouxos: se a estrutura mudar, o teste diz quanto.
    const capitulos = items.filter((item) => item.kind === "CHAPTER");
    expect(capitulos.filter((item) => item.number !== null).length, "capítulos numerados").toBe(10);
    // E a seção de vestibulares é um capítulo à parte, com os dez temas dentro dele.
    const vestibulares = capitulos.find((item) => item.number === null);
    expect(vestibulares?.title, "abertura da zona de vestibulares").toBe("Questões de vestibulares");
    const temas = items.filter((item) => item.kind === "EXERCISE_GROUP" && item.parentKey === vestibulares?.key);
    expect(temas.map((tema) => tema.title), "temas de vestibular").toHaveLength(10);

    expect(count("SECTION"), "seções romanas").toBe(83);
    expect(count("SUBSECTION"), "itens de teoria").toBe(159);
    expect(count("EXERCISE"), "exercícios discursivos").toBe(562);
    // 1 a 361, sem buraco: 254 e 255 dividem o enunciado com a 253 e não repetem a banca.
    expect(count("QUESTION"), "questões de vestibular").toBe(361);
    const temaDe = new Set(temas.map((tema) => tema.key));
    expect(items.filter((item) => item.kind === "QUESTION" && !temaDe.has(item.parentKey ?? "")), "questão fora de tema").toEqual([]);
    expect(fme.proposal!.metrics.lowConfidence, "itens de baixa confiança").toBe(0);

    // Toda questão de vestibular nasce com o tipo da zona; nenhum exercício do corpo nasce com ele.
    const vestibular = items.filter((item) => item.kind === "QUESTION");
    expect(vestibular.every((item) => item.metadata["questionType"] === "MULTIPLE_CHOICE")).toBe(true);
    expect(items.filter((item) => item.kind === "EXERCISE").some((item) => item.metadata["questionType"] !== undefined)).toBe(false);

    /*
      Os dois gabaritos não entram: 300 das 453 falsas seções do `book-v1` vinham dali.

      A asserção é pelo **número da página**, e não por um carimbo que o próprio motor pôs: se a
      zona fosse calculada errado, um carimbo errado concordaria com ela e o teste passaria.
    */
    const ordenadas = [...fme.zones].sort((a, b) => a.from - b.from);
    const gabaritos = ordenadas.filter((zone) => zone.skip === true);
    expect(gabaritos.length, "as duas zonas de gabarito").toBe(2);
    for (const zone of gabaritos) {
      const fim = ordenadas.find((outra) => outra.from > zone.from)?.from ?? Number.POSITIVE_INFINITY;
      const dentro = items.filter((item) => item.pageNumber >= zone.from && item.pageNumber < fim);
      expect(dentro.map((item) => `${item.kind} p.${item.pageNumber}`), `zona ${zone.label}`).toEqual([]);
    }
    expect(fme.proposal!.warnings.some((warning) => warning.includes("não foi varrida"))).toBe(true);
  });

  it("grava o relatório quando pedido", () => {
    if (!process.env["SCAN_REPORT"]) return;
    // Livro ou prova sai do **perfil**, não de um id escrito à mão: com `book-fme-v1` no corpus, o
    // teste de igualdade mandava o Fundamentos para a tabela de provas, com "359 / ?" questões.
    const ehLivro = (r: Measured) => captureProfile(r.entry.profile)?.documentKind === "BOOK";
    const exams = results.filter((r) => !ehLivro(r));
    const books = results.filter(ehLivro);
    const report = [
      "# Validação do scan estrutural",
      "",
      `*Fase 10 do [prompt 03](../prompts/) · issue #221 · gerado por \`tests/scan-corpus.test.ts\` em ${new Date().toISOString().slice(0, 10)}.*`,
      "Os números abaixo são **medidos**, pelo scan determinístico (sem IA e sem reconhecimento),",
      "sobre os PDFs reais desta máquina. O corpus não está no git (D48); a lista fica em",
      "`SCAN_CORPUS`. Quem regrava é o teste, não uma pessoa.",
      "",
      "## Provas (§57)",
      "",
      "Colunas: páginas · questões achadas / esperadas · completas · suspeitas · incompletas · sem",
      "evidência textual (alternativas em imagem) · com outra questão dentro · com alternativa",
      "faltando · com mais de uma âncora · que atravessam página · marcadas com língua · tempo.",
      "",
      "| Caderno | Pág. | Achadas | Compl. | Susp. | Incompl. | Sem evid. | Invasão | Alt. falt. | Multi-âncora | Multi-pág. | Língua | Tempo |",
      "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
      ...exams.map((r) =>
        r.entry.profile === "exam-v1" && r.proposal
          ? `| ${r.entry.label} (exam-v1) | ${r.pages} | ${questions(r.proposal).length} / ${r.entry.expectedQuestions ?? "?"} | — | — | — | — | — | — | ${r.proposal.metrics.multiRegion} | ${r.proposal.metrics.multiPage} | — | ${(r.ms / 1000).toFixed(1)} s |`
          : examRow(r),
      ),
      "",
      enemSummary(results.filter((r) => r.proposal && r.entry.profile === "exam-enem-v1")),
      "",
      "O `exam-v1` não tem diagnóstico por questão: é a estimativa da captura, página a página, e o",
      "30 de 30 do ENA é provado pelo teste de regressão sobre as páginas reais.",
      "",
      "## Livros (§58)",
      "",
      ...books.map(bookSection),
      "## O que este relatório não mede",
      "",
      "- A correção de cada item contra um gabarito humano: não há, ainda, revisão registrada sobre",
      "  este corpus. A proposta guarda o retrato do que o scan propôs ao lado do que a pessoa",
      "  corrigir (§59); a comparação fica possível assim que houver revisões.",
      "- O reconhecimento matemático e o desempate por IA, que dependem do modelo configurado e",
      "  entram só por pedido.",
      "- PDFs digitalizados (sem camada de texto): o corpus atual não tem nenhum.",
      "",
    ].join("\n");
    writeFileSync(path.join(root, "../../docs/_atual/source-scanning-validation.md"), report);
  });
});
