/**
 * O último erro, em uma linha.
 *
 * A §25 pede "último erro" na página de diagnóstico, e o que existe guardado é o
 * `diagnosticsJson` do job — uma lista que costuma trazer avisos antes do erro, e às vezes não
 * traz erro nenhum (timeout, worker morto no meio).
 *
 * Puro e no domínio porque é interpretação de dado, não acesso a banco: o adaptador conta linhas,
 * este arquivo decide **o que dizer**. E é aqui que os casos de borda cabem num teste.
 *
 * Ver spec §25 · issue #168.
 */

export function firstErrorMessage(diagnosticsJson: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(diagnosticsJson);
  } catch {
    // Diagnóstico ilegível não derruba a página de diagnóstico — ela é justamente aonde se vai
    // quando as coisas já estão estranhas.
    return null;
  }

  if (!Array.isArray(parsed)) return null;

  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) continue;

    const row = entry as { severity?: unknown; message?: unknown; line?: unknown };
    // **Só erro.** `Overfull \hbox` é `info` e aparece às dezenas em documento saudável; mostrá-lo
    // como "último erro" faria a página apontar ruído tipográfico como causa de uma falha.
    if (row.severity !== "error" || typeof row.message !== "string") continue;

    // A linha entra quando existe, e é a do **corpo** desde a #161: é a diferença entre procurar
    // e achar. `null` acontece em erro de preâmbulo, que não está no texto de ninguém.
    return typeof row.line === "number" ? `L${row.line}: ${row.message}` : row.message;
  }

  return null;
}
