-- A resposta final da questão (CONTEXT.md, *Resposta*). Coluna nova, e não a tabela recriada: o
-- acervo tem milhares de questões, e o SQLite acrescenta coluna com default sem copiar nada.
ALTER TABLE "questions" ADD COLUMN "answerLatex" TEXT NOT NULL DEFAULT '';
