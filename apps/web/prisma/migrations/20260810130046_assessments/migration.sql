-- CreateTable
CREATE TABLE "assessments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "assessments_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "assessment_sections" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assessmentId" TEXT NOT NULL,
    "title" TEXT,
    "sortKey" TEXT NOT NULL,
    CONSTRAINT "assessment_sections_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "assessment_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sectionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "sortKey" TEXT NOT NULL,
    "points" REAL,
    "pinnedLastOptionIdsJson" TEXT NOT NULL DEFAULT '[]',
    CONSTRAINT "assessment_items_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "assessment_sections" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "assessment_items_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "assessment_variants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assessmentId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "seed" INTEGER NOT NULL,
    "shuffleQuestions" BOOLEAN NOT NULL DEFAULT true,
    "shuffleOptions" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "assessment_variants_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "assessment_variant_questions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    CONSTRAINT "assessment_variant_questions_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "assessment_variants" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "assessment_variant_option_maps" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantQuestionId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "displayedLabel" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    CONSTRAINT "assessment_variant_option_maps_variantQuestionId_fkey" FOREIGN KEY ("variantQuestionId") REFERENCES "assessment_variant_questions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "document_templates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "preambleLatex" TEXT,
    "optionsJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "document_templates_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "assessments_workspaceId_idx" ON "assessments"("workspaceId");

-- CreateIndex
CREATE INDEX "assessment_sections_assessmentId_sortKey_idx" ON "assessment_sections"("assessmentId", "sortKey");

-- CreateIndex
CREATE INDEX "assessment_items_sectionId_sortKey_idx" ON "assessment_items"("sectionId", "sortKey");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_items_sectionId_questionId_key" ON "assessment_items"("sectionId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_variants_assessmentId_label_key" ON "assessment_variants"("assessmentId", "label");

-- CreateIndex
CREATE INDEX "assessment_variant_questions_variantId_position_idx" ON "assessment_variant_questions"("variantId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_variant_questions_variantId_questionId_key" ON "assessment_variant_questions"("variantId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_variant_option_maps_variantQuestionId_optionId_key" ON "assessment_variant_option_maps"("variantQuestionId", "optionId");

-- CreateIndex
CREATE UNIQUE INDEX "document_templates_workspaceId_name_key" ON "document_templates"("workspaceId", "name");
