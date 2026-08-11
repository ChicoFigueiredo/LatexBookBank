import type { LatexSnippet } from "./latex-knowledge";

/**
 * Um item de sugestão, descrito **sem o Monaco**.
 *
 * O editor é detalhe: a adaptação para `languages.CompletionItem` acontece em um arquivo da UI, e
 * é por isso que a ordenação, o intervalo substituído e a incorporação da seleção — que é onde
 * mora a regra — podem ser testados sem subir um editor.
 */
export interface CompletionCandidate {
  /** O que aparece na lista. Vem com a barra: quem digita `\` espera ver `\alpha`. */
  readonly label: string;
  /** Corpo no formato de snippet do Monaco. */
  readonly insertText: string;
  /** `true` quando o corpo tem `${…}` e precisa ser interpretado como snippet. */
  readonly isSnippet: boolean;
  readonly documentation: string | null;
  /** Texto à direita do rótulo: a forma legível do comando com os argumentos. */
  readonly detail: string | null;
  /**
   * Chave de ordenação.
   *
   * O Monaco ordena por comparação de string crescente, e a prioridade do legado é decrescente —
   * quanto maior, mais acima. A conversão é aritmética, e o `padStart` existe porque `"9"` viria
   * depois de `"10"` numa comparação textual.
   */
  readonly sortText: string;
  /** Palavra que o usuário digita, sem a barra — o Monaco filtra por ela. */
  readonly filterText: string;
}

/** Acima da maior prioridade que o legado usa (49), com folga para o que vier do produto. */
const PRIORITY_CEILING = 1000;

export function toCompletionCandidate(snippet: LatexSnippet): CompletionCandidate {
  const rank = Math.max(0, PRIORITY_CEILING - snippet.priority);

  return {
    label: `\\${snippet.trigger}`,
    insertText: snippet.body,
    isSnippet: snippet.hasPlaceholders,
    documentation: snippet.documentation,
    // O rótulo já é o gatilho; repeti-lo no detalhe seria ruído. Só mostramos a forma legível
    // quando ela diz algo a mais — `\frac{num}{den}` diz, `\alpha` não.
    detail: snippet.label === `\\${snippet.trigger}` ? null : snippet.label,
    sortText: `${String(rank).padStart(5, "0")}${snippet.trigger}`,
    filterText: snippet.trigger,
  };
}

/**
 * Coloca a seleção do editor dentro do primeiro ponto de parada.
 *
 * É o gesto do editor legado: selecionar uma palavra, clicar em **Negrito** e ver
 * `\textbf{palavra}` — não `\textbf{und}` com a palavra perdida. O Monaco resolve `TM_SELECTED_TEXT`
 * na hora da inserção, então basta aninhá-lo como valor padrão do `${1:…}`; se não houver seleção,
 * a variável cai no padrão original e o comportamento é o de sempre.
 *
 * Só o **primeiro** ponto de parada recebe a seleção. Distribuir o texto entre os outros exigiria
 * adivinhar onde ele deveria ser cortado, e adivinhar aqui erra mais do que acerta.
 */
export function withSelectionInFirstPlaceholder(body: string): string {
  // Casa `${1:padrão}` com padrão simples — sem `}` nem `$` dentro, que é o formato que o
  // importador produz. Um corpo já aninhado não casa, e sai daqui intacto.
  const match = /\$\{1:([^${}]*)\}/.exec(body);
  if (!match) return body;

  const fallback = match[1] ?? "";
  return body.replace(match[0], `\${1:\${TM_SELECTED_TEXT:${fallback}}}`);
}
