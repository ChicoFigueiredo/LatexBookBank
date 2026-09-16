-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_document_nodes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "publicationId" TEXT NOT NULL,
    "parentId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT,
    "slug" TEXT,
    "sortKey" TEXT NOT NULL,
    "numberingStyle" TEXT NOT NULL DEFAULT 'ARABIC',
    "originalLabel" TEXT,
    "bodyLatex" TEXT NOT NULL DEFAULT '',
    "questionId" TEXT,
    "sourceAnchorId" TEXT,
    "deletedAt" DATETIME,
    "legacyId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "document_nodes_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "publications" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "document_nodes_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "document_nodes" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "document_nodes_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "document_nodes_sourceAnchorId_fkey" FOREIGN KEY ("sourceAnchorId") REFERENCES "source_anchors" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_document_nodes" ("createdAt", "deletedAt", "id", "kind", "legacyId", "numberingStyle", "originalLabel", "parentId", "publicationId", "questionId", "slug", "sortKey", "sourceAnchorId", "title", "updatedAt") SELECT "createdAt", "deletedAt", "id", "kind", "legacyId", "numberingStyle", "originalLabel", "parentId", "publicationId", "questionId", "slug", "sortKey", "sourceAnchorId", "title", "updatedAt" FROM "document_nodes";
DROP TABLE "document_nodes";
ALTER TABLE "new_document_nodes" RENAME TO "document_nodes";
CREATE UNIQUE INDEX "document_nodes_questionId_key" ON "document_nodes"("questionId");
CREATE INDEX "document_nodes_publicationId_parentId_sortKey_idx" ON "document_nodes"("publicationId", "parentId", "sortKey");
CREATE INDEX "document_nodes_parentId_idx" ON "document_nodes"("parentId");
CREATE UNIQUE INDEX "document_nodes_publicationId_legacyId_key" ON "document_nodes"("publicationId", "legacyId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
