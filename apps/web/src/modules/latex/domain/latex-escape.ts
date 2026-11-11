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
 * Mora em `latex/` e não em `recognition/` desde a #262: a avaliação escapava o cabeçalho com uma
 * cópia própria, em várias passadas e sem a barra invertida, e `Lista 1\2` virava o comando `\2`.
 * Um escape só, para quem precisar escrever texto num `.tex`.
 *
 * Ver spec §19 · issue #193 · #262.
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

/**
 * Caractere da área de uso privado (U+E000–U+F8FF), ou de controle: um símbolo que a camada de
 * texto do PDF não soube ler.
 *
 * O *Fundamentos* escreve =, ∈, ∪ e ⇔ numa fonte própria, e o pdf.js entrega o código privado do
 * glifo, sem significado fora daquela fonte. Na importação de 2026-09-30, 746 das 929 questões do
 * volume 1 tinham algum, e o `pdflatex` recusava todas ("Unicode character U+E060"). A mesma fonte
 * entrega às vezes um caractere de controle (U+0001) no lugar do ≥ — 16 trechos do volume 1 (D76).
 * Tabulação e quebra de linha são texto, e ficam de fora.
 */
export const UNREADABLE_CHAR = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uE000-\uF8FF]/;

const UNREADABLE = new RegExp(UNREADABLE_CHAR.source, "g");

/** O texto tem símbolo que a camada de texto não leu — e que só o reconhecimento de visão recupera. */
export const hasUnreadableSymbol = (text: string): boolean => UNREADABLE_CHAR.test(text);

/**
 * O que entra no lugar do símbolo ilegível: uma caixa com interrogação, que compila e aparece no
 * PDF. Apagar o símbolo deixaria "x  2" sem aviso; mantê-lo derrubaria a compilação inteira.
 */
const UNREADABLE_MARK = "\\fbox{?}";

/**
 * Os símbolos matemáticos em Unicode e o comando que os escreve em modo matemático.
 *
 * O `pdflatex` com `inputenc` só conhece o latin-1 e alguns sinais de texto: "≤", "∈" ou o sinal
 * de menos (U+2212) derrubam a compilação inteira. Eles chegam pela camada de texto do PDF e, mais
 * vezes, pelo modelo de visão, que às vezes escreve "≠" em vez de `\neq` — na importação do
 * Fundamentos vol. 1, dez questões e corpos não compilavam por isso.
 */
export const UNICODE_MATH: Readonly<Record<string, string>> = {
  "−": "-",
  "≤": "\\leq",
  "≥": "\\geq",
  "≠": "\\neq",
  "≈": "\\approx",
  "≡": "\\equiv",
  "∈": "\\in",
  "∉": "\\notin",
  "∋": "\\ni",
  "⊂": "\\subset",
  "⊃": "\\supset",
  "⊆": "\\subseteq",
  "⊇": "\\supseteq",
  "∪": "\\cup",
  "∩": "\\cap",
  "∅": "\\emptyset",
  "∀": "\\forall",
  "∃": "\\exists",
  "∧": "\\wedge",
  "∨": "\\vee",
  "¬": "\\neg",
  "→": "\\rightarrow",
  "←": "\\leftarrow",
  "↔": "\\leftrightarrow",
  "⇒": "\\Rightarrow",
  "⇐": "\\Leftarrow",
  "⇔": "\\Leftrightarrow",
  "∞": "\\infty",
  "∘": "\\circ",
  "±": "\\pm",
  ℕ: "\\mathbb{N}",
  ℤ: "\\mathbb{Z}",
  ℚ: "\\mathbb{Q}",
  ℝ: "\\mathbb{R}",
  ℂ: "\\mathbb{C}",
  // O pdflatex não aceita estes no texto ("Unicode character √ not set up"): a camada de texto do
  // *Fundamentos* entrega a raiz, o ponto de produto, o perpendicular e as letras gregas soltos.
  "√": "\\surd",
  "⋅": "\\cdot",
  "⊥": "\\perp",
  α: "\\alpha",
  β: "\\beta",
  γ: "\\gamma",
  δ: "\\delta",
  Δ: "\\Delta",
  ε: "\\varepsilon",
  ζ: "\\zeta",
  η: "\\eta",
  θ: "\\theta",
  λ: "\\lambda",
  μ: "\\mu",
  π: "\\pi",
  ρ: "\\rho",
  σ: "\\sigma",
  Σ: "\\Sigma",
  τ: "\\tau",
  φ: "\\varphi",
  ω: "\\omega",
  Ω: "\\Omega",
  "◊": "\\lozenge",
  // O "maior ou igual" inclinado do vol. 5, e o congruente da geometria.
  "⩾": "\\geqslant",
  "⩽": "\\leqslant",
  "≅": "\\cong",
  // O ponto de produto e o triângulo de marcador do vol. 11.
  "∙": "\\cdot",
  "▲": "\\blacktriangle",
  // Índice e expoente em Unicode, da camada de texto ("log₃"): o pdflatex não os aceita. O ² e o ³
  // ficam de fora — o pdflatex os aceita no texto ("m²"), e é assim que o livro os escreve.
  ...Object.fromEntries([..."₀₁₂₃₄₅₆₇₈₉"].map((char, digit) => [char, `_{${digit}}`])),
  ₐ: "_{a}",
  ₓ: "_{x}",
  ₙ: "_{n}",
  ...Object.fromEntries([..."⁰⁴⁵⁶⁷⁸⁹"].map((char, index) => [char, `^{${"0456789"[index]}}`])),
  "⁺": "^{+}",
  "⁻": "^{-}",
  ⁿ: "^{n}",
};

export const UNICODE_MATH_CHARS = new RegExp(`[${Object.keys(UNICODE_MATH).join("")}]`, "g");

export const escapeLatexText = (text: string): string =>
  text
    .replace(/[\\%$&#_{}~^]/g, (char) => ESCAPES[char] ?? char)
    .replace(UNREADABLE, UNREADABLE_MARK)
    .replace(UNICODE_MATH_CHARS, (char) => `$${UNICODE_MATH[char]}$`)
    // O circunflexo combinado do ângulo — "AB̂C" —, que o pdflatex não aceita.
    .replace(/([A-Za-z])̂/g, "$\\hat{$1}$");

/**
 * O modo `text` é o único que escapa.
 *
 * Os outros três já vêm em LaTeX por definição — escapar `display` transformaria `\frac{1}{2}` em
 * texto literal, que é o oposto do que se pediu ao modelo.
 */
export const escapeIfProse = (text: string, mode: string): string =>
  mode === "text" ? escapeLatexText(text) : text;
