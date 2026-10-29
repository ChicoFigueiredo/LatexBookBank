/**
 * Aderência aos tokens: nenhuma cor literal fora de `design-system/tokens.css`.
 *
 * Adaptado do `_adherence.oxlintrc.json` do DS. A regra existe porque hex espalhado é como um
 * design system morre: cada literal é uma decisão que escapou do contrato, e o tema dark e o
 * alto contraste param de valer sem que ninguém perceba — a cor simplesmente não muda.
 *
 * Cor vai em `var(--token)`. Se falta um token, o certo é acrescentá-lo ao contrato.
 */

import { RAW_SQL, RUNTIME_LOAD } from "./eslint.boundaries.mjs";

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

const restrictSyntax = (list) => ({ "no-restricted-syntax": ["error", ...list] });

/**
 * Este bloco vem **depois** do de fronteira, e as duas regras são `no-restricted-syntax`: em flat
 * config o último bloco que casa substitui a regra inteira. Escrito só com os seletores de cor,
 * ele apagava o SQL cru na UI dos módulos e nas telas de `app/`, e o `import()`/`require` do
 * agente em `agents/ui` (H3). Por isso cada bloco repete o que a fronteira já exigia ali, e o do
 * agente vem por último, para valer sobre o genérico da UI dos módulos.
 */
const tokenAdherence = [
  {
    name: "tokens/adherence-design-system",
    files: ["src/design-system/**/*.{ts,tsx}"],
    rules: restrictSyntax(selectors),
  },
  {
    name: "tokens/adherence",
    files: ["src/modules/*/ui/**/*.{ts,tsx}", "app/**/*.tsx"],
    rules: restrictSyntax([RAW_SQL, ...selectors]),
  },
  {
    name: "tokens/adherence-agents",
    files: ["src/modules/agents/ui/**/*.{ts,tsx}"],
    rules: restrictSyntax([RAW_SQL, ...RUNTIME_LOAD("O agente"), ...selectors]),
  },
];

export default tokenAdherence;
