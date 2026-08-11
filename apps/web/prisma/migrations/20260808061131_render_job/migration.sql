-- CreateTable
CREATE TABLE "render_jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "questionId" TEXT,
    "contentHash" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "rendererVersion" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "diagnosticsJson" TEXT NOT NULL DEFAULT '[]',
    "stdout" TEXT NOT NULL DEFAULT '',
    "stderr" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "render_jobs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "render_jobs_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_assets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "publicationId" TEXT,
    "questionId" TEXT,
    "kind" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "originalFilename" TEXT,
    "sha256" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "renderJobId" TEXT,
    CONSTRAINT "assets_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "assets_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "publications" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "assets_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "assets_renderJobId_fkey" FOREIGN KEY ("renderJobId") REFERENCES "render_jobs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_assets" ("createdAt", "height", "id", "kind", "metadataJson", "mimeType", "originalFilename", "publicationId", "questionId", "sha256", "sizeBytes", "storageKey", "width", "workspaceId") SELECT "createdAt", "height", "id", "kind", "metadataJson", "mimeType", "originalFilename", "publicationId", "questionId", "sha256", "sizeBytes", "storageKey", "width", "workspaceId" FROM "assets";
DROP TABLE "assets";
ALTER TABLE "new_assets" RENAME TO "assets";
CREATE UNIQUE INDEX "assets_storageKey_key" ON "assets"("storageKey");
CREATE INDEX "assets_renderJobId_idx" ON "assets"("renderJobId");
CREATE INDEX "assets_workspaceId_kind_idx" ON "assets"("workspaceId", "kind");
CREATE INDEX "assets_sha256_idx" ON "assets"("sha256");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "render_jobs_questionId_createdAt_idx" ON "render_jobs"("questionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "render_jobs_workspaceId_contentHash_key" ON "render_jobs"("workspaceId", "contentHash");
