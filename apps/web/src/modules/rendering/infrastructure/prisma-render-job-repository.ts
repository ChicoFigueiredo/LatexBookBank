import "server-only";

import type { RenderDiagnostic } from "@latexbookbank/render-contract";

import { prisma } from "@infrastructure/database/sqlite/client";
import type {
  NewRenderJob,
  RenderArtifactRecord,
  RenderJobRecord,
  RenderJobRepository,
  RenderJobState,
} from "@modules/rendering/domain/render-job";

/**
 * Persistência do `RenderJob`.
 *
 * O job e seus artefatos entram **numa transação**: uma linha de job sem os artefatos faria a
 * interface mostrar "compilado" e não achar o PDF, que é pior do que não ter compilado.
 *
 * Os artefatos são `Asset` com `kind` derivado (`RENDER_*`) e `renderJobId` preenchido. Apagar o
 * job leva todos junto por cascade — que é exatamente a política de derivado da D29: render é
 * reconstruível, e o que é reconstruível pode ser descartado inteiro.
 */

/**
 * Ordena os artefatos como saíram do render.
 *
 * O banco não garante ordem sem `ORDER BY`, e o nome é o que carrega a paginação (`page-1`,
 * `page-2`, `page-10`). Comparação numérica, não textual: sem ela, `page-10` viria antes de
 * `page-2` e a leitura sairia embaralhada a partir da décima página.
 */
const byName = (a: { name: string }, b: { name: string }): number =>
  a.name.localeCompare(b.name, "en", { numeric: true });

function toRecord(row: {
  id: string;
  workspaceId: string;
  questionId: string | null;
  contentHash: string;
  profileId: string;
  rendererVersion: string;
  state: string;
  success: boolean;
  durationMs: number;
  diagnosticsJson: string;
  stdout: string;
  stderr: string;
  artifacts: {
    kind: string;
    storageKey: string;
    mimeType: string;
    sizeBytes: number;
    sha256: string;
    width: number | null;
    height: number | null;
    originalFilename: string | null;
  }[];
}): RenderJobRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    questionId: row.questionId,
    contentHash: row.contentHash,
    profileId: row.profileId,
    rendererVersion: row.rendererVersion,
    state: row.state as RenderJobState,
    success: row.success,
    durationMs: row.durationMs,
    diagnostics: JSON.parse(row.diagnosticsJson) as RenderDiagnostic[],
    stdout: row.stdout,
    stderr: row.stderr,
    artifacts: row.artifacts
      .map((asset): RenderArtifactRecord => ({
        kind: asset.kind === "RENDER_PDF" ? "RENDER_PDF" : "RENDER_PNG",
        storageKey: asset.storageKey,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
        sha256: asset.sha256,
        width: asset.width,
        height: asset.height,
        // `originalFilename` é onde o nome do artefato ficou guardado — o `Asset` não tem campo
        // próprio para isso, e inventar um só para o render seria alargar o modelo por um caso.
        name: asset.originalFilename ?? asset.storageKey,
      }))
      .sort(byName),
  };
}

const SELECT = {
  id: true,
  workspaceId: true,
  questionId: true,
  contentHash: true,
  profileId: true,
  rendererVersion: true,
  state: true,
  success: true,
  durationMs: true,
  diagnosticsJson: true,
  stdout: true,
  stderr: true,
  artifacts: {
    select: {
      kind: true,
      storageKey: true,
      mimeType: true,
      sizeBytes: true,
      sha256: true,
      width: true,
      height: true,
      originalFilename: true,
    },
  },
} as const;

export class PrismaRenderJobRepository implements RenderJobRepository {
  async findByContentHash(
    workspaceId: string,
    contentHash: string,
  ): Promise<RenderJobRecord | null> {
    const row = await prisma.renderJob.findUnique({
      where: { workspaceId_contentHash: { workspaceId, contentHash } },
      select: SELECT,
    });

    return row === null ? null : toRecord(row);
  }

  async create(job: NewRenderJob): Promise<RenderJobRecord> {
    const row = await prisma.renderJob.create({
      data: {
        workspaceId: job.workspaceId,
        questionId: job.questionId,
        contentHash: job.contentHash,
        profileId: job.profileId,
        rendererVersion: job.rendererVersion,
        state: job.state,
        success: job.success,
        durationMs: job.durationMs,
        diagnosticsJson: JSON.stringify(job.diagnostics),
        stdout: job.stdout,
        stderr: job.stderr,
        // Aninhado, e não em duas chamadas: o Prisma resolve numa transação só, e é isso que
        // impede um job existir sem os artefatos que ele diz ter.
        artifacts: {
          create: job.artifacts.map((artifact) => ({
            workspaceId: job.workspaceId,
            questionId: job.questionId,
            kind: artifact.kind,
            storageKey: artifact.storageKey,
            mimeType: artifact.mimeType,
            sha256: artifact.sha256,
            sizeBytes: artifact.sizeBytes,
            width: artifact.width,
            height: artifact.height,
            originalFilename: artifact.name,
          })),
        },
      },
      select: SELECT,
    });

    return toRecord(row);
  }
}
