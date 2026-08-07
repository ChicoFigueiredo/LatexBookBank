/**
 * Aderência aos tokens: nenhuma cor literal fora de `design-system/tokens.css`.
 *
 * Adaptado do `_adherence.oxlintrc.json` do DS. A regra existe porque hex espalhado é como um
 * design system morre: cada literal é uma decisão que escapou do contrato, e o tema dark e o
 * alto contraste param de valer sem que ninguém perceba — a cor simplesmente não muda.
 *
 * Cor vai em `var(--token)`. Se falta um token, o certo é acrescentá-lo ao contrato.
 */

const HEX = String.raw`#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b`;
const FUNCS = String.raw`\b(?:rgb|rgba|hsl|hsla|oklch|lab|lch)\(`;

const message =
  "Cor literal fora do contrato de tokens. Use var(--token). " +
  "Se o token não existe, acrescente-o a design-system/tokens.css — " +
  "sem isso o dark e o alto contraste deixam de valer em silêncio.";

/** Só o que vira estilo: `style={{…}}`, template de CSS, e strings de classe. */
const selectors = [
  { selector: `Literal[value=/${HEX}/]`, message },
  { selector: `TemplateElement[value.raw=/${HEX}/]`, message },
  { selector: `Literal[value=/${FUNCS}/]`, message },
  { selector: `TemplateElement[value.raw=/${FUNCS}/]`, message },
];

const tokenAdherence = [
  {
    name: "tokens/adherence",
    files: ["src/design-system/**/*.{ts,tsx}", "src/modules/*/ui/**/*.{ts,tsx}", "app/**/*.tsx"],
    rules: { "no-restricted-syntax": ["error", ...selectors] },
  },
];

export default tokenAdherence;
