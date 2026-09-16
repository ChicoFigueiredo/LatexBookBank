import "server-only";

import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@infrastructure/database/sqlite/client";
import { ANCHOR_ROLES } from "@modules/assets/domain/node-anchors";
import type {
  NewScanRun,
  ScanItemChanges,
  ScanRun,
  ScanRunPatch,
  ScanSource,
  ScanSourceReader,
  ScanStore,
} from "@modules/scan/application/scan-store";
import type { RawPage } from "@modules/scan/domain/page";
import {
  isReviewState,
  isScanKind,
  type ProposalMetrics,
  type ProposedItem,
  type ProposedRegion,
} from "@modules/scan/domain/proposal";
import {
  ITEM_ORIGINS,
  snapshotOf,
  type ScanItem,
} from "@modules/scan/domain/scan-item";
import { isScanRunState, type ScanSettings } from "@modules/scan/domain/scan-run";

/**
 * A proposta gravada (D51). JSON em `String`, como o resto do schema; lido de volta com
 * validação, porque "é o nosso banco" não impede uma linha escrita por uma versão antiga.
 */

const regionSchema = z.object({
  pageNumber: z.number().int().min(1),
  box: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }),
  role: z.enum(ANCHOR_ROLES),
});

const regionsSchema = z.array(regionSchema);

function parse<T>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

export function parseRegions(text: string): ProposedRegion[] {
  const result = regionsSchema.safeParse(parse<unknown>(text, []));
  return result.success ? result.data : [];
}

type RunRow = Prisma.ScanRunGetPayload<object>;
type ItemRow = Prisma.ScanItemGetPayload<object>;

function toRun(row: RunRow): ScanRun {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    publicationId: row.publicationId,
    sourceAssetId: row.sourceAssetId,
    profileId: row.profileId,
    profileVersion: row.profileVersion,
    engineVersion: row.engineVersion,
    settings: parse<ScanSettings>(row.settingsJson, {
      pageFrom: row.pageFrom,
      pageTo: row.pageTo || null,
      useAi: false,
      recognizeMath: "auto",
    }),
    runKey: row.runKey,
    state: isScanRunState(row.state) ? row.state : "FAILED",
    cancelRequested: row.cancelRequested,
    pageFrom: row.pageFrom,
    pageTo: row.pageTo,
    lastPageRead: row.lastPageRead,
    aiProviderId: row.aiProviderId,
    aiModel: row.aiModel,
    mathProviderId: row.mathProviderId,
    mathModel: row.mathModel,
    aiCalls: row.aiCalls,
    mathCalls: row.mathCalls,
    metrics: parse<ProposalMetrics | null>(row.metricsJson, null),
    warnings: parse<string[]>(row.warningsJson, []),
    pageOffset: row.pageOffset,
    error: row.error,
    heartbeatAt: row.heartbeatAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    createdAt: row.createdAt,
  };
}

export function toItem(row: ItemRow): ScanItem {
  const regions = parseRegions(row.regionsJson);
  const kind = isScanKind(row.kind) ? row.kind : "CONTENT";
  const base: ProposedItem = {
    key: row.key,
    parentKey: row.parentKey,
    kind,
    originalLabel: row.originalLabel,
    number: row.number,
    title: row.title,
    pageNumber: row.pageNumber,
    printedPage: row.printedPage,
    regions,
    text: row.text,
    latex: row.latex,
    needsMath: row.needsMath,
    confidence: row.confidence,
    confidenceParts: parse(row.confidencePartsJson, {}),
    evidence: parse<string[]>(row.evidenceJson, []),
    diagnostic: parse(row.diagnosticJson, null),
    metadata: parse(row.metadataJson, {}),
    reviewState: isReviewState(row.reviewState) ? row.reviewState : "NEEDS_REVIEW",
  };

  return {
    ...base,
    id: row.id,
    sortOrder: row.sortOrder,
    reviewedText: row.reviewedText,
    reviewedLatex: row.reviewedLatex,
    proposed: parse(row.proposedJson, snapshotOf(base)),
    origin: (ITEM_ORIGINS as readonly string[]).includes(row.origin)
      ? (row.origin as ScanItem["origin"])
      : "SCAN",
    aiDecision: parse(row.aiDecisionJson, null),
    mathResult: parse(row.mathResultJson, null),
    documentNodeId: row.documentNodeId,
    approvedAt: row.approvedAt?.toISOString() ?? null,
  };
}

function itemData(runId: string, item: ProposedItem & Partial<ScanItem>, sortOrder: number) {
  return {
    runId,
    key: item.key,
    parentKey: item.parentKey,
    sortOrder,
    kind: item.kind,
    originalLabel: item.originalLabel,
    number: item.number,
    title: item.title,
    pageNumber: item.pageNumber,
    printedPage: item.printedPage,
    regionsJson: JSON.stringify(item.regions),
    text: item.text,
    latex: item.latex,
    reviewedText: item.reviewedText ?? null,
    reviewedLatex: item.reviewedLatex ?? null,
    needsMath: item.needsMath,
    confidence: item.confidence,
    confidencePartsJson: JSON.stringify(item.confidenceParts),
    evidenceJson: JSON.stringify(item.evidence),
    diagnosticJson: item.diagnostic ? JSON.stringify(item.diagnostic) : null,
    metadataJson: JSON.stringify(item.metadata),
    reviewState: item.reviewState,
    proposedJson: JSON.stringify(item.proposed ?? snapshotOf(item)),
    origin: item.origin ?? "SCAN",
    aiDecisionJson: item.aiDecision ? JSON.stringify(item.aiDecision) : null,
    mathResultJson: item.mathResult ? JSON.stringify(item.mathResult) : null,
    documentNodeId: item.documentNodeId ?? null,
    approvedAt: item.approvedAt ? new Date(item.approvedAt) : null,
  };
}

export class PrismaScanStore implements ScanStore {
  async createRun(run: NewScanRun): Promise<ScanRun> {
    const row = await prisma.scanRun.create({
      data: {
        workspaceId: run.workspaceId,
        publicationId: run.publicationId,
        sourceAssetId: run.sourceAssetId,
        profileId: run.profileId,
        profileVersion: run.profileVersion,
        engineVersion: run.engineVersion,
        settingsJson: JSON.stringify(run.settings),
        runKey: run.runKey,
        pageFrom: run.pageFrom,
        pageTo: run.pageTo,
      },
    });
    return toRun(row);
  }

  async findRun(id: string): Promise<ScanRun | null> {
    const row = await prisma.scanRun.findUnique({ where: { id } });
    return row ? toRun(row) : null;
  }

  async findLatestByKey(publicationId: string, runKey: string): Promise<ScanRun | null> {
    const row = await prisma.scanRun.findFirst({
      where: { publicationId, runKey },
      orderBy: { createdAt: "desc" },
    });
    return row ? toRun(row) : null;
  }

  async listRuns(publicationId: string): Promise<readonly ScanRun[]> {
    const rows = await prisma.scanRun.findMany({
      where: { publicationId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return rows.map(toRun);
  }

  async updateRun(id: string, patch: ScanRunPatch): Promise<void> {
    const { metrics, warnings, ...plain } = patch;
    await prisma.scanRun.update({
      where: { id },
      data: {
        ...plain,
        ...(metrics !== undefined ? { metricsJson: metrics ? JSON.stringify(metrics) : null } : {}),
        ...(warnings !== undefined ? { warningsJson: JSON.stringify(warnings) } : {}),
      },
    });
  }

  async savePage(runId: string, page: RawPage): Promise<void> {
    const data = {
      width: page.width,
      height: page.height,
      hasTextLayer: page.spans.some((span) => span.text.trim() !== ""),
      rawJson: JSON.stringify(page),
    };
    // Retomar pode reler a página que estava sendo gravada quando o processo caiu.
    await prisma.scanPage.upsert({
      where: { runId_pageNumber: { runId, pageNumber: page.pageNumber } },
      create: { runId, pageNumber: page.pageNumber, ...data },
      update: {},
    });
  }

  async loadPages(runId: string, from: number, to: number): Promise<readonly RawPage[]> {
    const rows = await prisma.scanPage.findMany({
      where: { runId, pageNumber: { gte: from, lte: to } },
      orderBy: { pageNumber: "asc" },
      select: { rawJson: true },
    });
    return rows.map((row) => JSON.parse(row.rawJson) as RawPage);
  }

  async replaceItems(runId: string, items: readonly ProposedItem[]): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const reviewed = await tx.scanItem.count({
        where: { runId, OR: [{ approvedAt: { not: null } }, { origin: { not: "SCAN" } }] },
      });
      // Trabalho revisado nunca é sobrescrito em silêncio (§48): a proposta só é refeita antes.
      if (reviewed > 0) throw new Error("A proposta já tem revisão; peça um novo scan em vez de refazer esta.");
      await tx.scanItem.deleteMany({ where: { runId } });
      await tx.scanItem.createMany({ data: items.map((item, index) => itemData(runId, item, index)) });
    });
  }

  async listItems(runId: string): Promise<readonly ScanItem[]> {
    const rows = await prisma.scanItem.findMany({ where: { runId }, orderBy: { sortOrder: "asc" } });
    return rows.map(toItem);
  }

  async saveItemChanges(runId: string, changes: ScanItemChanges): Promise<void> {
    await prisma.$transaction(async (tx) => {
      if (changes.deletedIds.length > 0) {
        await tx.scanItem.deleteMany({ where: { runId, id: { in: [...changes.deletedIds] } } });
      }
      for (const item of changes.upserts) {
        // `proposedJson` é o retrato do que o scan propôs: gravado na criação, nunca depois.
        const { proposedJson, ...data } = itemData(runId, item, item.sortOrder);
        await tx.scanItem.upsert({
          where: { id: item.id },
          create: { id: item.id, proposedJson, ...data },
          update: data,
        });
      }
    });
  }
}

export class PrismaScanSources implements ScanSourceReader {
  async sourceFor(publicationId: string): Promise<ScanSource | null> {
    const publication = await prisma.publication.findUnique({
      where: { id: publicationId },
      select: { workspaceId: true, sourcePdfAssetId: true },
    });
    if (!publication?.sourcePdfAssetId) return null;

    const asset = await prisma.asset.findUnique({
      where: { id: publication.sourcePdfAssetId },
      select: { id: true, storageKey: true, sha256: true },
    });
    if (!asset) return null;

    return {
      workspaceId: publication.workspaceId,
      assetId: asset.id,
      storageKey: asset.storageKey,
      sha256: asset.sha256,
    };
  }

  async rememberedProfile(publicationId: string): Promise<string | null> {
    const row = await prisma.publication.findUnique({
      where: { id: publicationId },
      select: { captureProfileId: true },
    });
    return row?.captureProfileId ?? null;
  }

  async rememberProfile(publicationId: string, profileId: string): Promise<void> {
    await prisma.publication.update({ where: { id: publicationId }, data: { captureProfileId: profileId } });
  }
}

export async function storageKeyOfAsset(assetId: string): Promise<string | null> {
  const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { storageKey: true } });
  return asset?.storageKey ?? null;
}
