-- CreateTable
CREATE TABLE "document_node_anchors" (
    "documentNodeId" TEXT NOT NULL,
    "sourceAnchorId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'PRIMARY',

    PRIMARY KEY ("documentNodeId", "sourceAnchorId"),
    CONSTRAINT "document_node_anchors_documentNodeId_fkey" FOREIGN KEY ("documentNodeId") REFERENCES "document_nodes" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "document_node_anchors_sourceAnchorId_fkey" FOREIGN KEY ("sourceAnchorId") REFERENCES "source_anchors" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "document_node_anchors_sourceAnchorId_idx" ON "document_node_anchors"("sourceAnchorId");

-- Backfill (D50): toda âncora que já existia vira a âncora principal do seu nó. Nó sem âncora
-- própria herda a da questão que carrega — é o caso da questão ligada por `attachAnchorToQuestion`.
INSERT OR IGNORE INTO "document_node_anchors" ("documentNodeId", "sourceAnchorId", "sortOrder", "role")
SELECT n."id", COALESCE(n."sourceAnchorId", q."sourceAnchorId"), 0, 'PRIMARY'
FROM "document_nodes" n
LEFT JOIN "questions" q ON q."id" = n."questionId"
WHERE COALESCE(n."sourceAnchorId", q."sourceAnchorId") IS NOT NULL;
