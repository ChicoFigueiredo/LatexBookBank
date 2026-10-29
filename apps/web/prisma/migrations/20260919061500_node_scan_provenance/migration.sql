-- A execução do scan que criou o nó (D57, ADR 0006): é por ela que uma importação inteira é
-- encontrada para ser apagada. Aditiva — nós antigos ficam com NULL, que é a verdade sobre eles.
ALTER TABLE "document_nodes" ADD COLUMN "createdByScanRunId" TEXT;
CREATE INDEX "document_nodes_createdByScanRunId_idx" ON "document_nodes"("createdByScanRunId");
