/**
 * Conversão do delimitador legado `§` para o formato de snippet do Monaco.
 *
 * O editor antigo marcava os pontos de parada com `§nome§`:
 *
 *     \addcontentsline{§file§}{§secunit§}{§entry§}
 *
 * O Monaco usa `${n:nome}` e navega por Tab. A tradução é mecânica, mas **não é um replace**:
 * fora dos placeholders, `$`, `\` e `}` são metacaracteres da linguagem de snippet e precisam
 * ser escapados. Sem isso, `$ log_{b} a $` — que existe no acervo — abriria uma tabulação
 * fantasma no meio do texto, e todo comando LaTeX ficaria à mercê do parser de escape.
 */

const PLACEHOLDER_DELIMITER = "§";

/**
 * Escapa o texto que deve aparecer **literalmente** no editor.
 *
 * A ordem importa: a barra vem primeiro, senão ela escaparia as barras que acabamos de inserir.
 */
const escapeLiteral = (text: string): string =>
  text.replace(/\\/g, "\\\\").replace(/\$/g, "\\$").replace(/\}/g, "\\}");

/** Fim de linha do Windows vira `\n` — o legado é WPF e grava CRLF. */
const normalizeNewlines = (text: string): string => text.replace(/\r\n/g, "\n");

/**
 * Traduz um template legado em corpo de snippet do Monaco.
 *
 * Quando não há `§` nenhum, o resultado é o texto escapado — um snippet sem ponto de parada é
 * um snippet válido, e é o caso da maioria dos 653 autocompletes (só 349 têm placeholder).
 *
 * O cursor final (`$0`) só é acrescentado quando existe ao menos um ponto de parada: sem ele,
 * o Monaco já deixa o cursor no fim, e um `$0` gratuito atrapalharia quem só queria o comando.
 */
export function toMonacoSnippet(legacyTemplate: string): string {
  const source = normalizeNewlines(legacyTemplate);
  const parts = source.split(PLACEHOLDER_DELIMITER);

  // Contagem ímpar de `§` significa delimitador aberto e não fechado. Nenhuma linha do acervo
  // está nessa situação hoje, mas tratar como texto literal é o que evita que um dado torto
  // vire um snippet que engole o resto do documento.
  if (parts.length % 2 === 0) return escapeLiteral(source);

  let index = 0;
  const body = parts
    .map((part, position) => {
      if (position % 2 === 0) return escapeLiteral(part);
      index += 1;
      return `\${${index}:${escapeLiteral(part)}}`;
    })
    .join("");

  return index === 0 ? body : `${body}$0`;
}

/** `true` quando o template legado declara ao menos um ponto de parada. */
export const hasPlaceholders = (legacyTemplate: string): boolean =>
  (legacyTemplate.match(/§/g) ?? []).length >= 2;

/**
 * O gatilho do autocomplete.
 *
 * O legado guarda `Text` com e sem a barra inicial — `addto` numa linha, `\addto` em outra.
 * O Monaco casa a palavra digitada, e a barra é o caractere de disparo: normalizar aqui é o
 * que faz `\add` encontrar as duas.
 */
export const normalizeTrigger = (legacyText: string): string =>
  legacyText.trim().replace(/^\\+/, "");
