/**
 * A palette de símbolos, decidida fora da tela.
 *
 * Duas perguntas moram aqui: **como desenhar** um símbolo e **o que a busca encontra**. Nenhuma
 * delas é sobre React, e ambas erram de um jeito que só apareceria olhando 2.740 células.
 */

/** O índice: tudo que a palette precisa antes de carregar miniatura nenhuma. */
export interface SymbolEntry {
  readonly command: string;
  readonly groupName: string;
  readonly unicode: string | null;
  readonly requiredPackage: string | null;
  readonly mathMode: boolean;
}

/**
 * Como desenhar a célula.
 *
 * A ordem não é arbitrária. A miniatura vem primeiro porque é o desenho que o LaTeX **realmente**
 * produz: `\leq` tem o Unicode ≤, mas a fonte do sistema desenha diferente do TeX, e uma palette
 * que mente sobre a aparência do resultado é pior que uma palette feia. O Unicode é a segunda
 * opção, e o comando cru é a terceira — para os 62 símbolos que não têm nenhuma das duas, mostrar
 * `\dagger` ainda é informação.
 */
export type SymbolPreview =
  | { readonly kind: "svg"; readonly svg: string }
  | { readonly kind: "unicode"; readonly char: string }
  | { readonly kind: "command"; readonly command: string };

export function symbolPreview(entry: SymbolEntry, svg: string | undefined): SymbolPreview {
  if (svg) return { kind: "svg", svg };
  if (entry.unicode) return { kind: "unicode", char: entry.unicode };
  return { kind: "command", command: entry.command };
}

/** Tira acento e caixa: `Não` e `nao` têm de encontrar a mesma coisa. */
const fold = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/**
 * A busca casa por **todos** os termos, em qualquer ordem.
 *
 * Procurar em comando, Unicode e pacote junto é o que faz `arrow` achar `\leftarrow` e `amssymb`
 * achar os 205 símbolos daquele pacote. A barra é ignorada de propósito: quem digita `alpha` na
 * caixa de busca está procurando `\alpha`, e exigir a barra transformaria a busca em adivinhação.
 */
export function matchesSymbolQuery(entry: SymbolEntry, query: string): boolean {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;

  const haystack = fold(
    `${entry.command.replace(/^\\/, "")} ${entry.unicode ?? ""} ${entry.requiredPackage ?? ""}`,
  );

  return terms.every((term) => haystack.includes(term.replace(/^\\/, "")));
}

/**
 * Quantas células desenhar de uma vez.
 *
 * `fontawesome5` sozinho tem 1.566 símbolos, e mandar isso para o DOM de uma vez trava a rolagem
 * em máquina modesta. O corte é explícito e **contado na tela** — "mostrando 400 de 1.566" — em
 * vez de silencioso: uma lista truncada sem aviso faz parecer que o símbolo procurado não existe.
 */
export const PALETTE_RENDER_LIMIT = 400;

export interface PaletteView {
  readonly visible: readonly SymbolEntry[];
  readonly matched: number;
  readonly truncated: boolean;
}

export function paletteView(
  entries: readonly SymbolEntry[],
  groupName: string | null,
  query: string,
): PaletteView {
  // Buscar com termo digitado atravessa os grupos: quem procura `alpha` não sabe que ele está em
  // `greek`, e obrigar a acertar o grupo antes de buscar seria esconder o acervo do próprio dono.
  const searching = query.trim() !== "";
  const scoped =
    searching || groupName === null
      ? entries
      : entries.filter((entry) => entry.groupName === groupName);

  const matched = scoped.filter((entry) => matchesSymbolQuery(entry, query));

  return {
    visible: matched.slice(0, PALETTE_RENDER_LIMIT),
    matched: matched.length,
    truncated: matched.length > PALETTE_RENDER_LIMIT,
  };
}
