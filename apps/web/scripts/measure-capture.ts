import { readFileSync } from "node:fs";

import { zoneOfPage } from "../src/modules/scan/domain/capture-profile.ts";
import { assembleDocument } from "../src/modules/scan/domain/document.ts";
import { buildLines, type PageModel } from "../src/modules/scan/domain/page.ts";
import { captureProfile } from "../src/modules/scan/domain/profiles/index.ts";
import { buildProposal } from "../src/modules/scan/domain/structure.ts";
import { PdfjsDocumentReader } from "../src/modules/scan/infrastructure/pdfjs-document-reader.ts";

/**
 * Mede um perfil de captura contra um PDF, sem banco e sem modelo (D78).
 *
 * É a ferramenta de afiar um perfil derivado do `book-fme-v1`. A pergunta que importa não é
 * "quantos exercícios achou" — é **que linha do PDF não caiu em item nenhum**: foi ela que
 * mostrou, no Fundamentos vol. 1, o prefácio, os apêndices, as seis LEITURAS e a lista de siglas
 * que a estrutura perdia. Linha fora de item é texto que não chega ao acervo.
 *
 *     bun run scan:measure <arquivo.pdf> <perfil> [primeira página] [última página]
 *
 * Saída em Markdown: zonas, itens por tipo, respostas que acham a questão, tabelas, e as linhas
 * fora de qualquer item, por página. Folha de rosto, créditos e contracapa costumam aparecer ali,
 * e ficar de fora é o certo; o resto é regra que falta no perfil.
 */

async function main(): Promise<void> {
  const [file, profileId, fromArg, toArg] = process.argv.slice(2);
  const profile = profileId ? captureProfile(profileId) : null;
  if (!file || !profile) {
    console.error("Uso: bun run scan:measure <arquivo.pdf> <perfil> [primeira] [última]");
    process.exitCode = 1;
    return;
  }

  const pdf = await new PdfjsDocumentReader().open(new Uint8Array(readFileSync(file)));
  const from = Number(fromArg ?? 1);
  const to = Math.min(Number(toArg ?? pdf.pageCount), pdf.pageCount);
  const pages: PageModel[] = [];
  try {
    for (let page = from; page <= to; page++) pages.push(buildLines(await pdf.readPage(page)));
  } finally {
    await pdf.close();
  }

  const proposal = buildProposal(pages, profile);
  const items = proposal.items;
  const zones = profile.zones?.(pages) ?? [];
  const out: string[] = [`# ${profile.id} · ${file.split("/").at(-1)} · p. ${from}–${to}`, ""];

  out.push("## Zonas", "");
  for (const zone of zones) {
    const role = zone.answersTo ? `respostas de ${zone.answersTo}` : zone.skip ? "não varrida" : zone.questionType ? `questões ${zone.questionType}` : "estrutura";
    out.push(`- p. ${zone.from}: ${zone.label} — ${role}${zone.columns ? ", em colunas" : ""}`);
  }

  out.push("", "## Itens", "");
  const kinds = [...new Set(items.map((item) => item.kind))];
  for (const kind of kinds) out.push(`- ${kind}: ${items.filter((item) => item.kind === kind).length}`);
  const tables = items.filter((item) => item.kind === "FIGURE" && Array.isArray(item.metadata["tableRows"]));
  out.push(`- (das figuras, ${tables.length} são tabelas)`);

  const answers = items.filter((item) => item.kind === "ANSWER");
  if (answers.length > 0) {
    out.push("", "## Respostas", "");
    for (const kind of ["EXERCISE", "QUESTION"]) {
      const mine = answers.filter((answer) => answer.metadata["answersTo"] === kind);
      if (mine.length === 0) continue;
      const targets = new Set(items.filter((item) => item.kind === kind).map((item) => item.number));
      const orphan = mine.filter((answer) => !targets.has(answer.number));
      out.push(`- de ${kind}: ${mine.length}, ${orphan.length} sem questão do mesmo número${orphan.length ? ` (${orphan.slice(0, 10).map((a) => a.number).join(", ")})` : ""}`);
    }
  }

  // A cobertura: a linha de conteúdo — fora da mobília e do sumário — que não está em região nenhuma.
  const doc = assembleDocument(pages, profile.isProtected ? { protect: profile.isProtected.bind(profile) } : {});
  const size = new Map(pages.map((page) => [page.pageNumber, page]));
  const boxes = new Map<number, { x0: number; y0: number; x1: number; y1: number }[]>();
  for (const item of items) {
    for (const region of item.regions) {
      const page = size.get(region.pageNumber);
      if (!page) continue;
      const list = boxes.get(region.pageNumber) ?? [];
      list.push({
        x0: region.box.x * page.width,
        y0: region.box.y * page.height,
        x1: (region.box.x + region.box.width) * page.width,
        y1: (region.box.y + region.box.height) * page.height,
      });
      boxes.set(region.pageNumber, list);
    }
  }
  const outside = doc.lines.filter((line) => {
    if (zones.length > 0 && zoneOfPage(zones, line.pageNumber)?.skip && !zoneOfPage(zones, line.pageNumber)?.answersTo) return false;
    const cx = (line.x0 + line.x1) / 2;
    const cy = (line.y0 + line.y1) / 2;
    return !(boxes.get(line.pageNumber) ?? []).some((box) => cx >= box.x0 - 2 && cx <= box.x1 + 2 && cy >= box.y0 - 2 && cy <= box.y1 + 2);
  });
  out.push("", `## Linhas fora de qualquer item: ${outside.length}`, "");
  for (const line of outside) out.push(`- p. ${line.pageNumber} · ${line.size.toFixed(1)} pt · “${line.text.trim().slice(0, 100)}”`);

  if (proposal.warnings.length > 0) out.push("", "## Avisos", "", ...proposal.warnings.map((warning) => `- ${warning}`));
  console.log(out.join("\n"));
}

void main();
