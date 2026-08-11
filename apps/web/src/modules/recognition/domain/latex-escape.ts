/**
 * Prosa lida de um recorte, pronta para entrar num documento LaTeX.
 *
 * Reconhecer **texto** é diferente de reconhecer fórmula: a fórmula já vem em LaTeX, e a prosa vem
 * como está escrita no papel — com `%`, `$`, `&` e `_` que, colados num `.tex`, mudam o significado
 * em vez de aparecer.
 *
 * O pior deles é o `%`: ele comenta o resto da linha. Uma questão de matemática financeira lida de
 * um scan viraria "Um capital rende 2" — sem erro, sem aviso, com o PDF saindo bonito e errado. A
 * Fase 5 já tinha registrado o mesmo risco do outro lado ("`\%` não é comentário — o acervo é de
 * matemática, e metade das questões de porcentagem sumiria").
 *
 * **Não é sanitização.** Nada aqui protege contra conteúdo malicioso; é tradução de um texto que
 * não sabe que virou LaTeX. Quem protege a compilação é o worker, que roda sem `shell-escape` e
 * sem rede.
 *
 * Ver spec §19 · issue #193.
 */

/**
 * Os dez caracteres que o LaTeX reserva, e o que cada um vira.
 *
 * **Uma passagem só.** A primeira versão aplicava dez `replace` em sequência, com a barra
 * invertida primeiro para não escapar as barras que os outros inserissem — e ainda assim saía
 * errado: `\textbackslash{}` traz chaves, e as regras de `{` e `}` que vinham depois as
 * escapavam, produzindo `\textbackslash\{\}`. O teste pegou na primeira execução.
 *
 * Com um `replace` e uma tabela, o texto trocado nunca é relido. É a diferença entre "cuidar da
 * ordem" e "não haver ordem para cuidar".
 */
const ESCAPES: Readonly<Record<string, string>> = {
  "\\": "\\textbackslash{}",
  "%": "\\%",
  $: "\\$",
  "&": "\\&",
  "#": "\\#",
  _: "\\_",
  "{": "\\{",
  "}": "\\}",
  // `~` e `^` não têm forma curta: `\~` sozinho é um acento esperando uma letra, e sairia colado
  // na próxima. O `{}` fecha o argumento e devolve o caractere literal.
  "~": "\\textasciitilde{}",
  "^": "\\textasciicircum{}",
};

export const escapeLatexText = (text: string): string =>
  text.replace(/[\\%$&#_{}~^]/g, (char) => ESCAPES[char] ?? char);

/**
 * O modo `text` é o único que escapa.
 *
 * Os outros três já vêm em LaTeX por definição — escapar `display` transformaria `\frac{1}{2}` em
 * texto literal, que é o oposto do que se pediu ao modelo.
 */
export const escapeIfProse = (text: string, mode: string): string =>
  mode === "text" ? escapeLatexText(text) : text;
