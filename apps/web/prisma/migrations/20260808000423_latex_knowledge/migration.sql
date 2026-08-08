-- CreateTable
CREATE TABLE "latex_snippets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trigger" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "documentation" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "hasPlaceholders" BOOLEAN NOT NULL DEFAULT false,
    "legacyId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "latex_symbol_groups" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "legacyId" INTEGER
);

-- CreateTable
CREATE TABLE "latex_symbols" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "unicode" TEXT,
    "requiredPackage" TEXT,
    "mathMode" BOOLEAN NOT NULL DEFAULT false,
    "previewSvg" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "legacyId" INTEGER,
    CONSTRAINT "latex_symbols_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "latex_symbol_groups" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "latex_icon_menus" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupName" TEXT NOT NULL,
    "subGroupName" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "shortcut" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "legacyId" INTEGER
);

-- CreateIndex
CREATE UNIQUE INDEX "latex_snippets_legacyId_key" ON "latex_snippets"("legacyId");

-- CreateIndex
CREATE INDEX "latex_snippets_trigger_idx" ON "latex_snippets"("trigger");

-- CreateIndex
CREATE UNIQUE INDEX "latex_snippets_trigger_body_key" ON "latex_snippets"("trigger", "body");

-- CreateIndex
CREATE UNIQUE INDEX "latex_symbol_groups_name_key" ON "latex_symbol_groups"("name");

-- CreateIndex
CREATE UNIQUE INDEX "latex_symbol_groups_legacyId_key" ON "latex_symbol_groups"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "latex_symbols_legacyId_key" ON "latex_symbols"("legacyId");

-- CreateIndex
CREATE INDEX "latex_symbols_groupId_sortOrder_idx" ON "latex_symbols"("groupId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "latex_symbols_groupId_command_key" ON "latex_symbols"("groupId", "command");

-- CreateIndex
CREATE UNIQUE INDEX "latex_icon_menus_legacyId_key" ON "latex_icon_menus"("legacyId");

-- CreateIndex
CREATE INDEX "latex_icon_menus_groupName_subGroupName_sortOrder_idx" ON "latex_icon_menus"("groupName", "subGroupName", "sortOrder");
