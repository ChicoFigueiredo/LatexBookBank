-- DropIndex
DROP INDEX "assets_storageKey_key";

-- CreateIndex
CREATE INDEX "assets_storageKey_idx" ON "assets"("storageKey");
