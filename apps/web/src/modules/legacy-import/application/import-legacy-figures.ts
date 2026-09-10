import path from "node:path";

import { storeAsset, type StoredAssetRecord } from "@modules/assets/application/store-asset";
import type { StorageProvider } from "@/shared/ports";

import {
  legacyAssetRefsByQuestion,
  legacyQuestionAssetDir,
  locateLegacyAsset,
} from "../domain/legacy-asset-refs";
import {
  LEGACY_FIGURE_ASSET_KIND,
  legacyFigureFilename,
  legacyFigureLatexName,
  legacyFigureMimeType,
  type LegacyFileReader,
} from "../domain/legacy-figures";
import type { LegacyLibraryContents } from "../domain/legacy-library-reader";
import type { MissingAssetReason } from "./report-missing-legacy-assets";

/**
 * As figuras que o LaTeX de uma biblioteca cita, lidas do disco e prontas para virar `Asset`.
 *
 * Duas etapas, separadas de propósito:
 *
 * 1. **Resolver** — achar o arquivo, ler os bytes, calcular o `sha256` e, com ele, o nome que o
 *    LaTeX vai citar. Não precisa de workspace nem de storage, e por isso serve ao
 *    `mapLegacyLibrary` (que roda antes de existir workspace) tanto quanto ao backfill.
 * 2. **Guardar** — subir para o `StorageProvider` de um workspace concreto. Quem chama liga o
 *    `Asset` à questão, porque só quem chama sabe se a questão é uma linha no banco ou um `ref`
 *    num portable.
 *
 * O hash sai daqui, e não do storage, porque o nome depende dele e o nome precisa existir antes
 * de qualquer escrita: é ele que entra no LaTeX reescrito, e o LaTeX é gravado na mesma
 * transação que cria a questão.
 *
 * Ver checklist Fase 11, bloco "Figuras de questão → `Asset`" · issue #111 · #173.
 */

export type SkippedLegacyFigureReason = MissingAssetReason | "formato-nao-suportado";

export interface SkippedLegacyFigure {
  readonly legacyQuestionId: number;
  readonly field: string;
  readonly ref: string;
  readonly reason: SkippedLegacyFigureReason;
}

export interface ResolvedLegacyFigure {
  readonly legacyQuestionId: number;
  readonly idPublication: number;
  /** Como o LaTeX escreveu, já em POSIX — é a chave da reescrita. */
  readonly relativePath: string;
  /** Onde o arquivo foi achado, relativo à pasta da biblioteca. Só para o relatório. */
  readonly sourcePath: string;
  readonly field: string;
  readonly bytes: Uint8Array;
  readonly sha256: string;
  readonly mimeType: string;
  readonly originalFilename: string;
  /** O que o LaTeX passa a citar — o mesmo nome que o montador do bundle vai calcular. */
  readonly latexName: string;
}

export interface LegacyFiguresResolution {
  readonly figures: readonly ResolvedLegacyFigure[];
  readonly skipped: readonly SkippedLegacyFigure[];
  /** Por questão dona: caminho legado → nome novo. É o mapa que `rewriteLegacyAssetRefs` consome. */
  readonly renamesByQuestion: ReadonlyMap<number, ReadonlyMap<string, string>>;
}

export const EMPTY_LEGACY_FIGURES: LegacyFiguresResolution = {
  figures: [],
  skipped: [],
  renamesByQuestion: new Map(),
};

export interface ResolveLegacyFiguresOptions {
  /** Pasta que contém as `pub<N>/` — o `dirname` do `.knowchico`, não o arquivo. */
  readonly libraryDir: string;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function resolveLegacyFigures(
  contents: Pick<LegacyLibraryContents, "questions" | "options">,
  files: LegacyFileReader,
  options: ResolveLegacyFiguresOptions,
): Promise<LegacyFiguresResolution> {
  const figures: ResolvedLegacyFigure[] = [];
  const skipped: SkippedLegacyFigure[] = [];
  const renamesByQuestion = new Map<number, Map<string, string>>();

  for (const question of legacyAssetRefsByQuestion(contents)) {
    for (const ref of question.refs) {
      const base = { legacyQuestionId: question.legacyQuestionId, field: ref.field, ref: ref.raw };

      if (question.idPublication === null) {
        skipped.push({ ...base, reason: "questao-dona-desconhecida" });
        continue;
      }
      if (ref.escapesQuestionDir) {
        skipped.push({ ...base, reason: "caminho-escapa-da-pasta" });
        continue;
      }

      const questionDir = path.posix.join(
        options.libraryDir,
        legacyQuestionAssetDir(question.idPublication, question.legacyQuestionId),
      );
      const located = await locateLegacyAsset(files, questionDir, ref.relativePath);
      if (located === null) {
        skipped.push({ ...base, reason: "arquivo-ausente" });
        continue;
      }

      const mimeType = legacyFigureMimeType(located);
      if (mimeType === null) {
        skipped.push({ ...base, reason: "formato-nao-suportado" });
        continue;
      }

      const bytes = await files.readFile(located);
      const sha256 = await sha256Hex(bytes);
      const latexName = legacyFigureLatexName(located, sha256, mimeType);

      figures.push({
        legacyQuestionId: question.legacyQuestionId,
        idPublication: question.idPublication,
        relativePath: ref.relativePath,
        sourcePath: path.posix.relative(options.libraryDir, located),
        field: ref.field,
        bytes,
        sha256,
        mimeType,
        originalFilename: legacyFigureFilename(located),
        latexName,
      });

      const renames = renamesByQuestion.get(question.legacyQuestionId) ?? new Map<string, string>();
      renames.set(ref.relativePath, latexName);
      renamesByQuestion.set(question.legacyQuestionId, renames);
    }
  }

  return { figures, skipped, renamesByQuestion };
}

/**
 * Sobe uma figura resolvida para o storage de um workspace.
 *
 * Passa pelo mesmo `storeAsset` da rota de upload — validação de MIME contra extensão, dimensões
 * do cabeçalho —, para que uma figura importada não seja um asset de segunda classe. O hash que
 * o storage devolve **tem** que bater com o calculado na resolução: o nome já está no LaTeX, e
 * um hash diferente seria um nome que não cita arquivo nenhum.
 */
export async function storeLegacyFigure(
  figure: ResolvedLegacyFigure,
  storage: StorageProvider,
  workspaceId: string,
): Promise<StoredAssetRecord> {
  const stored = await storeAsset(
    {
      workspaceId,
      filename: figure.originalFilename,
      mimeType: figure.mimeType,
      content: figure.bytes,
      kind: LEGACY_FIGURE_ASSET_KIND,
    },
    storage,
  );

  if (stored.sha256 !== figure.sha256) {
    throw new Error(
      `A figura ${figure.sourcePath} foi gravada com sha256 ${stored.sha256}, mas o LaTeX cita ` +
        `${figure.latexName} (calculado de ${figure.sha256}). O storage e a resolução discordam.`,
    );
  }

  return stored;
}
