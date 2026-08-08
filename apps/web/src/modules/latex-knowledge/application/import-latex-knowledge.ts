import { dedupeKnowledge } from "../domain/dedupe-knowledge";
import type {
  LatexKnowledgeCounts,
  LatexKnowledgeRepository,
  LegacyLatexMetadataReader,
  SkippedRows,
} from "../domain/latex-knowledge";

/**
 * Importa o conhecimento LaTeX do banco legado.
 *
 * O relatório é o produto, não um efeito colateral. O levantamento diz 653 autocompletes, 2.741
 * símbolos, 13 grupos e 29 menus, e o único jeito de saber que o importador funcionou é fechar a
 * conta:
 *
 *     origem = gravados + duplicatas + descartados
 *
 * Por isso as três parcelas aparecem separadas. Um relatório que dissesse só "28 menus ok"
 * esconderia justamente o que interessa — que o 29º existe e por que ficou de fora.
 */

export interface ImportReport {
  /** O que o legado tinha, antes de qualquer descarte. */
  readonly source: LatexKnowledgeCounts;
  readonly written: LatexKnowledgeCounts;
  readonly duplicateSnippets: number;
  readonly duplicateSymbols: number;
  readonly skipped: SkippedRows;
  /** Símbolos sem Unicode **e** sem SVG: não têm como aparecer na palette. */
  readonly symbolsWithoutPreview: number;
  readonly durationMs: number;
}

export interface ImportOptions {
  /** Injetável para o teste medir sem depender do relógio real. */
  readonly now?: () => number;
}

export async function importLatexKnowledge(
  reader: LegacyLatexMetadataReader,
  repository: LatexKnowledgeRepository,
  options: ImportOptions = {},
): Promise<ImportReport> {
  const now = options.now ?? (() => Date.now());
  const startedAt = now();

  const { knowledge: raw, sourceCounts, skipped } = await reader.read();
  const { knowledge, report } = dedupeKnowledge(raw);

  const written = await repository.replaceAll(knowledge);

  return {
    source: sourceCounts,
    written,
    duplicateSnippets: report.duplicateSnippets,
    duplicateSymbols: report.duplicateSymbols,
    skipped,
    symbolsWithoutPreview: knowledge.symbols.filter((s) => !s.unicode && !s.previewSvg).length,
    durationMs: now() - startedAt,
  };
}

/** O relatório em texto, para o console do importador. */
export function formatImportReport(report: ImportReport): string {
  const line = (label: string, source: number, written: number, notes: string[]): string => {
    const explained = notes.length > 0 ? `  — ${notes.join(", ")}` : "";
    return `  ${label.padEnd(18)} ${String(written).padStart(6)} de ${String(source).padStart(6)} na origem${explained}`;
  };

  const notes = (duplicates: number, skipped: number): string[] => [
    ...(duplicates > 0 ? [`${duplicates} duplicata(s)`] : []),
    ...(skipped > 0 ? [`${skipped} sem dado utilizável`] : []),
  ];

  return [
    "Conhecimento LaTeX importado:",
    line(
      "autocompletes",
      report.source.snippets,
      report.written.snippets,
      notes(report.duplicateSnippets, report.skipped.snippets),
    ),
    line("grupos", report.source.symbolGroups, report.written.symbolGroups, []),
    line(
      "símbolos",
      report.source.symbols,
      report.written.symbols,
      notes(report.duplicateSymbols, report.skipped.symbols),
    ),
    line(
      "menus de ícones",
      report.source.iconMenus,
      report.written.iconMenus,
      notes(0, report.skipped.iconMenus),
    ),
    `  ${"sem miniatura".padEnd(18)} ${String(report.symbolsWithoutPreview).padStart(6)} símbolo(s) sem Unicode e sem SVG`,
    `  ${"tempo".padEnd(18)} ${String(report.durationMs).padStart(6)} ms`,
  ].join("\n");
}

/**
 * A conta fecha?
 *
 * `origem = gravados + duplicatas + descartados`, por categoria. Não é decoração: é a asserção
 * que transforma o relatório em prova — e é o que o teste de aceite da fase verifica.
 */
export function reportBalances(report: ImportReport): boolean {
  return (
    report.source.snippets ===
      report.written.snippets + report.duplicateSnippets + report.skipped.snippets &&
    report.source.symbols ===
      report.written.symbols + report.duplicateSymbols + report.skipped.symbols &&
    report.source.iconMenus === report.written.iconMenus + report.skipped.iconMenus &&
    report.source.symbolGroups === report.written.symbolGroups
  );
}
