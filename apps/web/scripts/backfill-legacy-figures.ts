import path from "node:path";

import { PrismaLibSql } from "@prisma/adapter-libsql";

import { PrismaClient } from "../src/generated/prisma/client.ts";
import { LocalFileStorageProvider } from "../src/infrastructure/storage/local/local-file-storage-provider.ts";
import {
  resolveLegacyFigures,
  storeLegacyFigure,
  type ResolvedLegacyFigure,
} from "../src/modules/legacy-import/application/import-legacy-figures.ts";
import { rewriteLegacyAssetRefs } from "../src/modules/legacy-import/domain/legacy-asset-refs.ts";
import { LEGACY_FIGURE_ASSET_KIND } from "../src/modules/legacy-import/domain/legacy-figures.ts";
import { NodeLegacyFsProbe } from "../src/modules/legacy-import/infrastructure/node-legacy-fs-probe.ts";
import { SqliteLegacyLibraryReader } from "../src/modules/legacy-import/infrastructure/sqlite-legacy-library-reader.ts";

/**
 * Completa as **figuras de questão** das bibliotecas já importadas da Fase 11.
 *
 * O `map-legacy-library.ts` original montava `assets: []`, e `backfill-legacy-assets.ts` só traz
 * capa e PDF da publicação — as figuras que o LaTeX cita (`images/clipboard_<ts>.png`) ficaram
 * no disco do acervo, e o renderizador do produto novo respondia `File not found`. Este script
 * faz, para o banco que já existe, o que `write-legacy-import.ts` passou a fazer no import: lê a
 * figura na pasta da questão dona, grava como `Asset` (`QUESTION_IMAGE`, `sha256`), liga à
 * questão e **reescreve o LaTeX** para citar o nome do asset — o mesmo nome que o montador do
 * bundle calcula (`assetLatexName`).
 *
 * Idempotente por (`sha256`, questão): rodar de novo não duplica asset, e o LaTeX já reescrito
 * não tem mais o caminho antigo para trocar.
 *
 * A biblioteca é relida do `.knowchico` (`Workspace.legacySourcePath`) — é lá que estão o
 * `idPublication` e o `IdQuestao` que dão a pasta no disco. Uma questão que o import excluiu
 * por invariante, ou um nó estrutural com `latexResposta`, não tem linha de `Question` no banco:
 * a figura fica sem dona e é **reportada**, não inventada.
 *
 *     bun run scripts/backfill-legacy-figures.ts                # dry-run
 *     CONFIRM=yes bun run scripts/backfill-legacy-figures.ts    # grava
 */

interface DbOption {
  readonly id: string;
  readonly legacyId: number | null;
  readonly statementLatex: string;
  readonly solutionLatex: string;
}

interface DbQuestion {
  readonly id: string;
  readonly legacyId: number | null;
  readonly statementLatex: string;
  readonly solutionLatex: string;
  readonly complementLatex: string;
  readonly options: readonly DbOption[];
  readonly assets: readonly { readonly sha256: string }[];
  readonly node: { readonly publication: { readonly legacyId: number | null } } | null;
}

async function main(): Promise<void> {
  const confirmed = process.env["CONFIRM"] === "yes";
  const url = process.env["DATABASE_URL"];
  const storageRoot = process.env["STORAGE_ROOT"];
  if (!url) throw new Error("DATABASE_URL ausente. Rode `bun run setup`.");
  if (!storageRoot) throw new Error("STORAGE_ROOT ausente.");

  const prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) });
  const storage = new LocalFileStorageProvider({ rootDir: storageRoot });
  const files = new NodeLegacyFsProbe();

  let stored = 0;
  let alreadyStored = 0;
  let rewritten = 0;
  let withoutOwner = 0;
  let skipped = 0;
  let failed = 0;

  try {
    const workspaces = await prisma.workspace.findMany({
      where: { legacyId: { not: null }, legacySourcePath: { not: null } },
      select: { id: true, name: true, legacySourcePath: true },
      orderBy: { name: "asc" },
    });

    for (const workspace of workspaces) {
      const libraryPath = workspace.legacySourcePath as string;

      if (!(await files.exists(libraryPath))) {
        console.log(`—  ${workspace.name}: .knowchico não está em ${libraryPath} (religue com religar-acervo-legado.ts)`);
        continue;
      }

      const contents = await new SqliteLegacyLibraryReader(libraryPath).read();
      const resolution = await resolveLegacyFigures(contents, files, {
        libraryDir: path.dirname(libraryPath),
      });

      for (const entry of resolution.skipped) {
        skipped += 1;
        console.log(`⛔ ${workspace.name} / questão ${entry.legacyQuestionId} · ${entry.field} · ${entry.ref}: ${entry.reason}`);
      }
      if (resolution.figures.length === 0) continue;

      const legacyIds = [...new Set(resolution.figures.map((figure) => figure.legacyQuestionId))];
      const questions: readonly DbQuestion[] = await prisma.question.findMany({
        where: { legacyId: { in: legacyIds }, node: { publication: { workspaceId: workspace.id } } },
        select: {
          id: true,
          legacyId: true,
          statementLatex: true,
          solutionLatex: true,
          complementLatex: true,
          options: { select: { id: true, legacyId: true, statementLatex: true, solutionLatex: true } },
          // Só fonte: um `RENDER_PNG` com o mesmo hash seria coincidência, não figura gravada.
          assets: { where: { renderJobId: null }, select: { sha256: true } },
          node: { select: { publication: { select: { legacyId: true } } } },
        },
      });
      const byLegacyId = new Map(questions.map((question) => [question.legacyId, question]));

      for (const figure of resolution.figures) {
        const question = byLegacyId.get(figure.legacyQuestionId);
        const label = `${workspace.name} / pub${figure.idPublication} / questão ${figure.legacyQuestionId} · ${figure.relativePath}`;

        if (question === undefined) {
          withoutOwner += 1;
          console.log(`—  ${label}: sem questão no banco (excluída no import, ou nó estrutural)`);
          continue;
        }

        if (question.assets.some((asset) => asset.sha256 === figure.sha256)) {
          alreadyStored += 1;
          console.log(`=  ${label}: já gravada (${figure.latexName})`);
          continue;
        }

        if (!confirmed) {
          stored += 1;
          console.log(`+  ${label}: gravaria como ${figure.latexName} (${figure.bytes.byteLength} bytes)`);
          continue;
        }

        try {
          await storeFigure(prisma, storage, workspace.id, question.id, figure);
          stored += 1;
          console.log(`✅ ${label}: gravada como ${figure.latexName} (${figure.bytes.byteLength} bytes)`);
        } catch (error) {
          failed += 1;
          console.log(`❌ ${label}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // O LaTeX é reescrito por questão, depois dos assets dela: um enunciado que cita o nome
      // novo sem o asset gravado seria exatamente o `File not found` que se quer eliminar.
      for (const question of questions) {
        const renames = resolution.renamesByQuestion.get(question.legacyId as number);
        if (renames === undefined) continue;

        const changes = latexChanges(question, renames);
        if (changes.length === 0) continue;

        rewritten += changes.length;
        for (const change of changes) {
          console.log(`${confirmed ? "✏️ " : "~ "} ${workspace.name} / questão ${question.legacyId} · ${change.where}: ${confirmed ? "reescrito" : "reescreveria"}`);
        }

        if (!confirmed) continue;
        await prisma.$transaction(changes.map((change) => change.apply(prisma)));
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(
    `\n${confirmed ? "Gravadas" : "Dry-run — gravaria"}: ${stored} figura(s). Já gravadas: ${alreadyStored}. ` +
      `Campos ${confirmed ? "reescritos" : "a reescrever"}: ${rewritten}. Sem questão no banco: ${withoutOwner}. ` +
      `Ignoradas: ${skipped}. Falhas: ${failed}.`,
  );
  if (!confirmed) console.log("Nada foi escrito. Rode com CONFIRM=yes para gravar.");
  if (failed > 0) process.exitCode = 1;
}

async function storeFigure(
  prisma: PrismaClient,
  storage: LocalFileStorageProvider,
  workspaceId: string,
  questionId: string,
  figure: ResolvedLegacyFigure,
): Promise<void> {
  const record = await storeLegacyFigure(figure, storage, workspaceId);

  await prisma.asset.create({
    data: {
      workspaceId,
      questionId,
      kind: LEGACY_FIGURE_ASSET_KIND,
      storageKey: record.storageKey,
      mimeType: record.mimeType,
      originalFilename: record.originalFilename,
      sha256: record.sha256,
      sizeBytes: record.sizeBytes,
      width: record.width,
      height: record.height,
    },
  });
}

interface LatexChange {
  readonly where: string;
  readonly apply: (prisma: PrismaClient) => ReturnType<PrismaClient["question"]["update"]> | ReturnType<PrismaClient["questionOption"]["update"]>;
}

/** Os campos que mudam com a reescrita — e só eles. `originalLatex` é proveniência e fica como veio. */
function latexChanges(question: DbQuestion, renames: ReadonlyMap<string, string>): LatexChange[] {
  const changes: LatexChange[] = [];

  const questionData: Record<string, string> = {};
  for (const field of ["statementLatex", "solutionLatex", "complementLatex"] as const) {
    const next = rewriteLegacyAssetRefs(question[field], renames);
    if (next !== question[field]) questionData[field] = next;
  }
  if (Object.keys(questionData).length > 0) {
    changes.push({
      where: Object.keys(questionData).join(", "),
      apply: (prisma) => prisma.question.update({ where: { id: question.id }, data: questionData }),
    });
  }

  for (const option of question.options) {
    const optionData: Record<string, string> = {};
    for (const field of ["statementLatex", "solutionLatex"] as const) {
      const next = rewriteLegacyAssetRefs(option[field], renames);
      if (next !== option[field]) optionData[field] = next;
    }
    if (Object.keys(optionData).length > 0) {
      changes.push({
        where: `alternativa ${option.legacyId ?? option.id} (${Object.keys(optionData).join(", ")})`,
        apply: (prisma) =>
          prisma.questionOption.update({ where: { id: option.id }, data: optionData }),
      });
    }
  }

  return changes;
}

await main();
