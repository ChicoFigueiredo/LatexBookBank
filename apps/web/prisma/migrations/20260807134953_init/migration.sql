-- CreateTable
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "legacyId" INTEGER,
    "legacySourcePath" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "publications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "nickname" TEXT,
    "isbn" TEXT,
    "otherIdentifier" TEXT,
    "publisher" TEXT,
    "publicationDate" DATETIME,
    "notes" TEXT,
    "coverAssetId" TEXT,
    "sourcePdfAssetId" TEXT,
    "legacyId" INTEGER,
    "legacyUuid" TEXT,
    "legacyUpdatedAt" DATETIME,
    "importedAt" DATETIME,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "publications_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "authors" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "publication_authors" (
    "publicationId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY ("publicationId", "authorId"),
    CONSTRAINT "publication_authors_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "publications" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "publication_authors_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "authors" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "document_nodes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "publicationId" TEXT NOT NULL,
    "parentId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT,
    "slug" TEXT,
    "sortKey" TEXT NOT NULL,
    "numberingStyle" TEXT NOT NULL DEFAULT 'ARABIC',
    "originalLabel" TEXT,
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

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "nickname" TEXT,
    "statementLatex" TEXT NOT NULL DEFAULT '',
    "solutionLatex" TEXT NOT NULL DEFAULT '',
    "complementLatex" TEXT NOT NULL DEFAULT '',
    "originalLatex" TEXT,
    "difficulty" INTEGER NOT NULL DEFAULT 5,
    "year" INTEGER,
    "board" TEXT,
    "institution" TEXT,
    "role" TEXT,
    "roleLevel" TEXT,
    "publisher" TEXT,
    "videoUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "validationStatus" TEXT NOT NULL DEFAULT 'UNVALIDATED',
    "sourceAnchorId" TEXT,
    "legacyId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "questions_sourceAnchorId_fkey" FOREIGN KEY ("sourceAnchorId") REFERENCES "source_anchors" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "question_options" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "questionId" TEXT NOT NULL,
    "sortKey" TEXT NOT NULL,
    "statementLatex" TEXT NOT NULL DEFAULT '',
    "solutionLatex" TEXT NOT NULL DEFAULT '',
    "originalLatex" TEXT,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "weight" REAL,
    "legacyMarcacao" TEXT,
    "legacyId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "question_options_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'CUSTOM',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tags_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "question_tags" (
    "questionId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    PRIMARY KEY ("questionId", "tagId"),
    CONSTRAINT "question_tags_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "question_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "assets" (
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
    CONSTRAINT "assets_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "assets_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "publications" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "assets_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "source_anchors" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "publicationId" TEXT NOT NULL,
    "sourceAssetId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "xNormalized" REAL NOT NULL,
    "yNormalized" REAL NOT NULL,
    "widthNormalized" REAL NOT NULL,
    "heightNormalized" REAL NOT NULL,
    "rotation" REAL,
    "cropAssetId" TEXT,
    "sourceText" TEXT,
    "extractionMethod" TEXT,
    "extractionModel" TEXT,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "source_anchors_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "publications" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "source_anchors_sourceAssetId_fkey" FOREIGN KEY ("sourceAssetId") REFERENCES "assets" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "source_anchors_cropAssetId_fkey" FOREIGN KEY ("cropAssetId") REFERENCES "assets" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_legacyId_key" ON "workspaces"("legacyId");

-- CreateIndex
CREATE INDEX "publications_workspaceId_idx" ON "publications"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "publications_workspaceId_legacyId_key" ON "publications"("workspaceId", "legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "authors_name_key" ON "authors"("name");

-- CreateIndex
CREATE UNIQUE INDEX "document_nodes_questionId_key" ON "document_nodes"("questionId");

-- CreateIndex
CREATE INDEX "document_nodes_publicationId_parentId_sortKey_idx" ON "document_nodes"("publicationId", "parentId", "sortKey");

-- CreateIndex
CREATE INDEX "document_nodes_parentId_idx" ON "document_nodes"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "document_nodes_publicationId_legacyId_key" ON "document_nodes"("publicationId", "legacyId");

-- CreateIndex
CREATE INDEX "questions_type_idx" ON "questions"("type");

-- CreateIndex
CREATE INDEX "questions_difficulty_idx" ON "questions"("difficulty");

-- CreateIndex
CREATE INDEX "questions_board_year_idx" ON "questions"("board", "year");

-- CreateIndex
CREATE INDEX "question_options_questionId_sortKey_idx" ON "question_options"("questionId", "sortKey");

-- CreateIndex
CREATE UNIQUE INDEX "tags_workspaceId_name_key" ON "tags"("workspaceId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "assets_storageKey_key" ON "assets"("storageKey");

-- CreateIndex
CREATE INDEX "assets_workspaceId_kind_idx" ON "assets"("workspaceId", "kind");

-- CreateIndex
CREATE INDEX "assets_sha256_idx" ON "assets"("sha256");

-- CreateIndex
CREATE INDEX "source_anchors_publicationId_pageNumber_idx" ON "source_anchors"("publicationId", "pageNumber");
