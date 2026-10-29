/**
 * "38,2 MB" — vírgula, porque o produto é em português e o número é lido, não calculado.
 *
 * Abaixo de 1 MB vira KB inteiro: "0,4 MB" não diz nada que "412 KB" não diga melhor. E nunca
 * "0 KB": um arquivo minúsculo continua sendo um arquivo.
 *
 * Um só para o produto inteiro (STM-16 da revisão de 2026-09-23): o mesmo PDF aparecia como
 * "12.3 kB" no diagnóstico e "12 KB" no livro.
 */
export function formatarTamanho(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;

  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}
