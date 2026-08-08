/**
 * Onde começa o texto que uma sugestão substitui.
 *
 * Mora no domínio, e não junto do provider, por um motivo que o teste tornou concreto: qualquer
 * arquivo que importe `monaco-editor` toca `window` ao ser avaliado e não roda fora do navegador.
 * Aqui isto é aritmética sobre uma string, e o teste exercita justamente o caso que só apareceria
 * digitando.
 */

/**
 * Um comando LaTeX aberto imediatamente antes do cursor.
 *
 * Dígito não entra: `\x2` é o comando `\x` seguido de um `2`, e tratar o `2` como parte do nome
 * faria a sugestão comer um caractere que o usuário escreveu de propósito.
 */
const COMMAND_BEFORE_CURSOR = /\\[a-zA-Z@]*$/;

/**
 * O `\` é parte do que o usuário digitou e precisa entrar no intervalo substituído.
 *
 * O Monaco não faz isso sozinho: a definição de "palavra" dele não inclui a barra, então o
 * intervalo padrão cobriria só `alp`. Aceitar `\alp` deixaria **`\\alpha`** no texto — a barra
 * digitada mais a barra do item.
 *
 * Sem barra antes do cursor (o caso do `Ctrl+Space` no meio de uma palavra) vale o intervalo da
 * palavra que o editor calculou, e a barra do item é inserida junto.
 *
 * Colunas do Monaco são 1-based.
 */
export function replaceStartColumn(
  lineUntilCursor: string,
  cursorColumn: number,
  wordStartColumn: number,
): number {
  const typedCommand = COMMAND_BEFORE_CURSOR.exec(lineUntilCursor);
  return typedCommand ? cursorColumn - typedCommand[0].length : wordStartColumn;
}
