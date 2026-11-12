-- As figuras de uma questão saem do asset pela âncora do recorte (`loadQuestionAssets`). Sem estes
-- índices, cada asset varria todas as âncoras: compilar uma questão do Fundamentos vol. 1 levava
-- 3,7 min com 17 mil assets e 23 mil âncoras; com eles, 91 ms.

-- CreateIndex
CREATE INDEX "assets_questionId_idx" ON "assets"("questionId");

-- CreateIndex
CREATE INDEX "source_anchors_cropAssetId_idx" ON "source_anchors"("cropAssetId");
