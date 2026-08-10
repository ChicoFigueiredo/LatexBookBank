-- CreateTable
CREATE TABLE "revisions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "origin" TEXT NOT NULL,
    "agentRunId" TEXT,
    "summary" TEXT NOT NULL DEFAULT '',
    "snapshotJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "revisions_entityType_entityId_createdAt_idx" ON "revisions"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "revisions_entityType_entityId_revisionNumber_key" ON "revisions"("entityType", "entityId", "revisionNumber");
