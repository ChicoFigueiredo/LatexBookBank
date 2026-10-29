/**
 * O teto de um `.lbb`, o mesmo em todos os lados (SEC-03): o corpo que a rota de import aceita, o
 * corpo que o proxy do Next guarda para ela (`next.config.ts`), o total que a leitura descompacta e
 * o que a exportação aceita gerar.
 *
 * Eram dois números: a rota cortava em 512 MB e a leitura aceitava 2 GB, e um backup com os PDFs
 * entre os dois era recusado pelo próprio app. 1 GB porque o arquivo inteiro passa pela memória
 * mais de uma vez, no corpo e no descompactado; o acervo real tem 109 MB.
 *
 * Num arquivo sem import nenhum: `next.config.ts` o carrega antes de o app existir.
 */
export const MAX_ARCHIVE_BYTES = 1024 * 1024 * 1024;
