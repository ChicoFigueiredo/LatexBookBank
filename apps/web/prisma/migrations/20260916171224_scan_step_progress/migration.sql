-- O andamento da etapa depois da leitura (lotes da IA, itens da matemática).
ALTER TABLE "scan_runs" ADD COLUMN "stepDone" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "scan_runs" ADD COLUMN "stepTotal" INTEGER NOT NULL DEFAULT 0;
