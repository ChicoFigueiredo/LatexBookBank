-- AlterTable
ALTER TABLE "publications" ADD COLUMN "captureProfileId" TEXT;

-- CreateTable
CREATE TABLE "scan_runs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "sourceAssetId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "profileVersion" INTEGER NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "settingsJson" TEXT NOT NULL,
    "runKey" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'QUEUED',
    "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
    "pageFrom" INTEGER NOT NULL,
    "pageTo" INTEGER NOT NULL,
    "lastPageRead" INTEGER NOT NULL DEFAULT 0,
    "aiProviderId" TEXT,
    "aiModel" TEXT,
    "mathProviderId" TEXT,
    "mathModel" TEXT,
    "aiCalls" INTEGER NOT NULL DEFAULT 0,
    "mathCalls" INTEGER NOT NULL DEFAULT 0,
    "metricsJson" TEXT,
    "warningsJson" TEXT,
    "pageOffset" INTEGER,
    "error" TEXT,
    "heartbeatAt" DATETIME,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "scan_runs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "scan_runs_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "publications" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "scan_runs_sourceAssetId_fkey" FOREIGN KEY ("sourceAssetId") REFERENCES "assets" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "scan_pages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "width" REAL NOT NULL,
    "height" REAL NOT NULL,
    "hasTextLayer" BOOLEAN NOT NULL,
    "rawJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "scan_pages_runId_fkey" FOREIGN KEY ("runId") REFERENCES "scan_runs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "scan_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "parentKey" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "originalLabel" TEXT,
    "number" TEXT,
    "title" TEXT,
    "pageNumber" INTEGER NOT NULL,
    "printedPage" TEXT,
    "regionsJson" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "latex" TEXT,
    "reviewedText" TEXT,
    "reviewedLatex" TEXT,
    "needsMath" BOOLEAN NOT NULL DEFAULT false,
    "confidence" REAL NOT NULL,
    "confidencePartsJson" TEXT NOT NULL,
    "evidenceJson" TEXT NOT NULL,
    "diagnosticJson" TEXT,
    "metadataJson" TEXT NOT NULL,
    "reviewState" TEXT NOT NULL,
    "proposedJson" TEXT NOT NULL,
    "origin" TEXT NOT NULL DEFAULT 'SCAN',
    "aiDecisionJson" TEXT,
    "mathResultJson" TEXT,
    "documentNodeId" TEXT,
    "approvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "scan_items_runId_fkey" FOREIGN KEY ("runId") REFERENCES "scan_runs" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "scan_items_documentNodeId_fkey" FOREIGN KEY ("documentNodeId") REFERENCES "document_nodes" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "scan_runs_publicationId_createdAt_idx" ON "scan_runs"("publicationId", "createdAt");

-- CreateIndex
CREATE INDEX "scan_runs_runKey_idx" ON "scan_runs"("runKey");

-- CreateIndex
CREATE UNIQUE INDEX "scan_pages_runId_pageNumber_key" ON "scan_pages"("runId", "pageNumber");

-- CreateIndex
CREATE INDEX "scan_items_runId_sortOrder_idx" ON "scan_items"("runId", "sortOrder");

-- CreateIndex
CREATE INDEX "scan_items_documentNodeId_idx" ON "scan_items"("documentNodeId");

-- CreateIndex
CREATE UNIQUE INDEX "scan_items_runId_key_key" ON "scan_items"("runId", "key");
