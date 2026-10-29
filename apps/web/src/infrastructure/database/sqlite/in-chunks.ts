/**
 * Listas de `in` em pedaços que o SQLite aceita.
 *
 * O adaptador libSQL recusa consulta com mais de 999 parâmetros (P2029 do Prisma), contando os
 * outros filtros. As listas montadas com os ids de um livro inteiro passam disso: o *Fundamentos*
 * vol. 1 importado tem 1254 nós, 929 questões e 941 recortes. Em 2026-09-30 a conferência de
 * "Apagar importação" quebrou com 500 por isso, e os testes, com livros de vinte nós, nunca
 * chegavam perto.
 *
 * 500 deixa folga para os outros parâmetros da consulta. Escrita em pedaços vai dentro de uma
 * transação, para continuar sendo tudo ou nada.
 */
export const IN_LIST_LIMIT = 500;

export function inChunks<T>(values: readonly T[], size: number = IN_LIST_LIMIT): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < values.length; start += size)
    chunks.push(values.slice(start, start + size));
  return chunks;
}
