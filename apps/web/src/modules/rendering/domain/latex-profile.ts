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
  ],
};

export const RENDER_PROFILES: readonly RenderProfile[] = [
  QUESTION_PREVIEW_PROFILE,
  LEGACY_COMPATIBILITY_PROFILE,
];

export const profileById = (id: string): RenderProfile | null =>
  RENDER_PROFILES.find((profile) => profile.id === id) ?? null;
