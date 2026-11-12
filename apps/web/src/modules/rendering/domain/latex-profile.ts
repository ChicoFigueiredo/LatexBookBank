import type { RenderProfile } from "@latexbookbank/render-contract";

/**
 * Perfis de compilação.
 *
 * Um perfil é **resolvido**: leva o preâmbulo inteiro consigo, não um nome para o worker procurar.
 * Procurar exigiria catálogo no worker — quer dizer, estado —, e estado no worker é o que faz duas
 * réplicas produzirem PDFs diferentes para a mesma entrada.
 *
 * O `id` entra no `RenderJob` e no hash de cache: trocar de perfil recompila, que é o correto,
 * porque trocar de preâmbulo muda o PDF.
 */

/**
 * Os operadores da notação brasileira — `sen`, `tg`, `cotg` —, que o LaTeX não traz.
 *
 * O modelo de visão escreve `\tg x` e `\cotg x` ao ler o *Fundamentos*, como o livro imprime, e o
 * pdflatex parava com "Undefined control sequence" (vol. 7, Geometria Analítica). `\providecommand`
 * e não `\DeclareMathOperator`: se um package já define algum deles, o dele vale, e nada quebra.
 * O preview rápido usa a mesma lista no MathJax.
 */
export const BRAZILIAN_OPERATORS = [
  "sen",
  "tg",
  "cotg",
  "cossec",
  "cosec",
  "arcsen",
  "arctg",
  "arccotg",
  "senh",
  "tgh",
  "cotgh",
  "mdc",
  "mmc",
] as const;

/**
 * Os caracteres Unicode que o acervo traz crus e o pdflatex não conhece ("Unicode character ➞
 * (U+279E) not set up for use with LaTeX"): a seta dos limites do vol. 8 do Fundamentos (62 das 78
 * falhas dele), o incremento ∆, a integral, o somatório, o ⩾ inclinado. No preâmbulo, e não só na
 * aprovação: vale para o que já está no acervo, sem aprovar de novo.
 */
const UNICODE_CHARACTERS: readonly (readonly [string, string])[] = [
  ["279E", "\\rightarrow"],
  ["2794", "\\rightarrow"],
  ["279C", "\\rightarrow"],
  ["2192", "\\rightarrow"],
  ["21D2", "\\Rightarrow"],
  ["21D4", "\\Leftrightarrow"],
  ["2206", "\\Delta"],
  ["222B", "\\int"],
  ["2211", "\\sum"],
  ["220F", "\\prod"],
  ["2A7E", "\\geqslant"],
  ["2A7D", "\\leqslant"],
  ["2264", "\\leq"],
  ["2265", "\\geq"],
  ["2260", "\\neq"],
  ["2245", "\\cong"],
  ["2248", "\\approx"],
  ["2219", "\\cdot"],
  ["22C5", "\\cdot"],
  ["2212", "-"],
  ["221A", "\\surd"],
  ["221E", "\\infty"],
  ["2208", "\\in"],
  ["2209", "\\notin"],
  ["2282", "\\subset"],
  ["2283", "\\supset"],
  ["222A", "\\cup"],
  ["2229", "\\cap"],
  ["2205", "\\emptyset"],
  ["22A5", "\\perp"],
  ["2200", "\\forall"],
  ["2203", "\\exists"],
  ["25B2", "\\blacktriangle"],
  ["25CA", "\\lozenge"],
];

const unicodeCharacters = UNICODE_CHARACTERS.map(
  ([code, command]) => `\\DeclareUnicodeCharacter{${code}}{\\ensuremath{${command}}}`,
).join("");

/** Numa linha só: é uma declaração, não treze packages. */
const brazilianOperators = BRAZILIAN_OPERATORS.map(
  (name) => `\\providecommand{\\${name}}{\\operatorname{${name}}}`,
).join("");

/**
 * **Legacy Compatibility** — o preâmbulo do `LatexRender5/latex-includes.tex`, o que compilou o
 * acervo por vinte anos.
 *
 * Copiado do arquivo real, na ordem original, sem "melhorar" nada. A ordem importa em LaTeX
 * (`fontenc` antes de `inputenc`, `xcolor` antes de quem o usa), e reordenar por gosto é o tipo de
 * mudança que só aparece três questões depois.
 *
 * ## A divergência, declarada
 *
 * Falta **`iwona`** — a fonte que o comentário do legado chama de "fonte bonita". Ela só existe em
 * `texlive-fonts-extra`, que instalado ocupa 1,41 GB e mais que dobraria a imagem do worker por
 * uma escolha tipográfica.
 *
 * O que muda sem ela: o documento cai na Latin Modern (do `lmodern`, que está na imagem). O texto
 * fica com desenho diferente e **a matemática também**, porque o legado carrega `iwona` com a
 * opção `math`. As quebras de linha podem mudar junto, já que as larguras dos glifos diferem.
 *
 * Está aqui, e não escondido num README, porque quem comparar um PDF novo com um antigo vai notar
 * — e precisa achar a explicação onde procurar primeiro.
 */
export const LEGACY_COMPATIBILITY_PROFILE: RenderProfile = {
  id: "legacy-compatibility",
  documentClass: "article",
  documentClassOptions: ["12pt"],
  engine: "pdflatex",
  preamble: [
    "\\usepackage{amsmath}",
    "\\usepackage{amssymb}",
    "\\usepackage{amsfonts}",
    "\\usepackage{lmodern}",
    "\\usepackage[T1]{fontenc}",
    // `\usepackage[condensed,math]{iwona}` — ausente na imagem; ver a nota acima.
    "\\usepackage[utf8]{inputenc}",
    "\\usepackage{ragged2e}",
    "\\usepackage{lastpage}",
    "\\usepackage{indentfirst}",
    "\\usepackage[dvipsnames,table]{xcolor}",
    "\\usepackage{graphicx}",
    // `float` é o que dá o `[H]` das figuras do scan (D58): a figura do livro fica **onde
    // estava**. Sem ele, `figure` flutua para o alto da página e se descola do parágrafo que a
    // explica — que é justamente o que a importação tenta preservar.
    "\\usepackage{float}",
    "\\usepackage{microtype}",
    "\\usepackage[brazilian,hyperpageref]{backref}",
    "\\usepackage[num]{abntex2cite}",
    "\\usepackage{adjustbox}",
    "\\usepackage{subcaption}",
    "\\usepackage{enumitem}",
    "\\usepackage{siunitx}",
    // O acervo escreve valores em reais como `\SI{1000}{\real}`, e `\real` **não** existe no
    // siunitx — é uma unidade que precisa ser declarada. Sem esta linha, toda questão de
    // matemática financeira falha com "Undefined control sequence", que foi exatamente o que a
    // primeira compilação de uma questão real devolveu.
    "\\DeclareSIUnit{\\real}{R\\$}",
    "\\usepackage[section]{placeins}",
    "\\usepackage{multirow}",
    "\\usepackage{array,tabularx,makecell}",
    "\\usepackage{booktabs}",
    "\\usepackage{rotating}",
    "\\usepackage{xfrac}",
    "\\usepackage{bm}",
    "\\usepackage{xstring}",
    "\\usepackage{pgfplots}",
    "\\pgfplotsset{compat=1.15}",
    "\\usepackage{xlop}",
    "\\usepackage[makeroom]{cancel}",
    "\\usepackage{mathrsfs}",
    "\\usepackage{tikz}",
    "\\usetikzlibrary{matrix,arrows,decorations.pathmorphing,positioning," +
      "intersections,decorations.markings,calc,shapes}",
    "\\usepackage{arrayjob}",
    // As três macros do legado. Sem elas, questões que usam `\colorcancel` param de compilar — e
    // são elas que fazem o "cortar variável" colorido que o acervo usa em álgebra.
    "\\newcommand{\\tikzmark}[1]{\\tikz[overlay,remember picture] \\node (#1) {};}",
    "\\newcommand\\colorcancel[2][black]{\\renewcommand\\CancelColor{\\color{#1}}\\cancel{#2}}",
    "\\newcommand\\ontop[1]{\\adjustbox{valign=t}{#1}\\qquad}",
    // `lipsum` e `inline-images` ficaram de fora: o primeiro só gera texto de exemplo, e o
    // segundo baixa imagem da internet — que o worker não tem, por decisão (D35).
    brazilianOperators,
    unicodeCharacters,
    "\\pagestyle{empty}",
  ],
};

/**
 * **Question Preview** — o mínimo para ver uma questão.
 *
 * Existe porque o perfil legado carrega 34 packages, e carregar `abntex2cite`, `backref` e
 * `rotating` para desenhar um enunciado de três linhas custa segundos que a pessoa espera olhando.
 * O preview usa este; a compilação autoritativa usa o legado.
 *
 * A página é recortada no conteúdo (`preview` do `standalone`), porque uma questão de quatro
 * linhas numa folha A4 vira uma imagem que é 90% branco.
 */
export const QUESTION_PREVIEW_PROFILE: RenderProfile = {
  id: "question-preview",
  documentClass: "standalone",
  documentClassOptions: ["preview", "border=8pt", "varwidth=16cm"],
  engine: "pdflatex",
  preamble: [
    "\\usepackage[utf8]{inputenc}",
    "\\usepackage[T1]{fontenc}",
    "\\usepackage{lmodern}",
    "\\usepackage{amsmath}",
    "\\usepackage{amssymb}",
    "\\usepackage{graphicx}",
    // `float` é o que dá o `[H]` das figuras do scan (D58): a figura do livro fica **onde
    // estava**. Sem ele, `figure` flutua para o alto da página e se descola do parágrafo que a
    // explica — que é justamente o que a importação tenta preservar.
    "\\usepackage{float}",
    "\\usepackage{enumitem}",
    "\\usepackage{siunitx}",
    // O acervo escreve valores em reais como `\SI{1000}{\real}`, e `\real` **não** existe no
    // siunitx — é uma unidade que precisa ser declarada. Sem esta linha, toda questão de
    // matemática financeira falha com "Undefined control sequence", que foi exatamente o que a
    // primeira compilação de uma questão real devolveu.
    "\\DeclareSIUnit{\\real}{R\\$}",
    "\\usepackage[makeroom]{cancel}",
    "\\usepackage{xlop}",
    "\\usepackage{xcolor}",
    "\\newcommand\\colorcancel[2][black]{\\renewcommand\\CancelColor{\\color{#1}}\\cancel{#2}}",
    brazilianOperators,
    unicodeCharacters,
  ],
};

export const RENDER_PROFILES: readonly RenderProfile[] = [
  QUESTION_PREVIEW_PROFILE,
  LEGACY_COMPATIBILITY_PROFILE,
];

export const profileById = (id: string): RenderProfile | null =>
  RENDER_PROFILES.find((profile) => profile.id === id) ?? null;
