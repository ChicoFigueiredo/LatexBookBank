/**
 * O que o nome de uma fonte diz sobre o texto.
 *
 * O PDF não marca "isto é um título": marca a fonte. `LMRoman12-Bold`, `CMBX10`, `LMMathItalic10`
 * são o que um livro de LaTeX usa, e é o nome — não o desenho — que chega pela camada de texto. O
 * perfil tipográfico do livro (`typography.ts`) se apoia nestas três perguntas.
 *
 * O prefixo de subconjunto (`ABCDEF+`) é removido: ele muda de PDF para PDF sem mudar a fonte.
 */

export interface FontTraits {
  readonly family: string;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly math: boolean;
}

const BOLD = /bold|black|heavy|semibold|demi|^cmbx|^cmb\d|^cmssbx|-b$|bx\d/i;
const ITALIC = /italic|oblique|slant|^cmti|^cmsl|^cmmi|-it$|-i$/i;
/**
 * Fontes de matemática do TeX e as famílias Unicode de matemática. `Symbol` entra porque é o que o
 * Word usa para ∑ e ≤ em PDF antigo.
 */
const MATH =
  /math|^cmmi|^cmsy|^cmex|^cmbsy|^msam|^msbm|^eufm|^eusm|^rsfs|^stix|symbol|^mtmi|^mtsy|^esint|^wasy|cambriamath/i;

export function fontTraits(fontName: string): FontTraits {
  const family = fontName.replace(/^[A-Z]{6}\+/, "");

  return {
    family,
    bold: BOLD.test(family),
    italic: ITALIC.test(family),
    math: MATH.test(family),
  };
}

/** Caracteres que só aparecem em matemática — pista para PDF sem fonte de matemática nomeada. */
const MATH_CHARS = /[∫∬∮∑∏√∞≤≥≠≈≡±∓×÷∂∇∈∉∋⊂⊃⊆⊇∪∩∅∀∃→←↔⇒⇐⇔↦αβγδεζηθικλμνξπρστυφχψωΓΔΘΛΞΠΣΦΨΩ′″]/u;

export function looksLikeMath(text: string): boolean {
  return MATH_CHARS.test(text);
}
