-- Trocar de perfil sem jogar fora a revisão.
--
-- O perfil entra na `runKey`, então varrer o mesmo livro com outro perfil é outra execução — e
-- era, até aqui, começar do zero: as horas de revisão da anterior iam junto. A coluna registra de
-- onde a execução nova herdou o que uma pessoa havia decidido.
--
-- Aditiva: execuções que não herdaram de ninguém ficam com NULL, que é a verdade sobre elas.
ALTER TABLE "scan_runs" ADD COLUMN "inheritedFromRunId" TEXT;
