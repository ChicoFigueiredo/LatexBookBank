-- O retrato do perfil no dia da varredura (ADR 0008).
--
-- Um perfil de captura vive no código, e código sai. Quando ele sai, a execução antiga perdia o
-- que precisava para ser aprovada — o tipo padrão de questão — e a tela perdia o rótulo e os
-- tipos, abrindo com os seletores vazios. Guardar o retrato resolve os dois sem consultar o
-- registro vivo.
--
-- Aditiva: execuções anteriores ficam com NULL, e para elas o perfil vivo continua respondendo.
ALTER TABLE "scan_runs" ADD COLUMN "profileSnapshotJson" TEXT;
