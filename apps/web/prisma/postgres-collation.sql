-- Colação das colunas de ordenação (D38, Fase 6.5).
--
-- O `sortKey` é fractional index em base-62, que mistura caixa. A colação padrão de um
-- PostgreSQL glibc ignora caixa e inverte a lista em silêncio — medido: `a0` antes de `Zz`.
-- Aplicar **depois** do `prisma migrate deploy`; o Prisma não tem como expressar isto.

ALTER TABLE "document_nodes" ALTER COLUMN "sortKey" TYPE text COLLATE "C";
ALTER TABLE "question_options" ALTER COLUMN "sortKey" TYPE text COLLATE "C";
