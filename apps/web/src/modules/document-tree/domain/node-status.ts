/**
 * Qual estado a árvore mostra num nó — quando há mais de um verdadeiro ao mesmo tempo.
 *
 * A `Tree` tem **um** slot de status por nó, e uma questão pode estar inválida, com render
 * quebrado e não salva ao mesmo tempo. Escolher qual aparece é decisão de produto, não detalhe de
 * render — daí morar aqui, testável, e não dentro do `map` que monta a lista.
 *
 * A regra é: **o mais recuperável primeiro**. Não é o mais grave — é o que a pessoa consegue
 * resolver agora, e que se perde se ela clicar em outro nó. Texto não salvo some ao trocar de
 * questão; uma questão inválida continua inválida amanhã.
 *
 * Ver spec §4.1 · issue #147.
 */

/** Os estados que a árvore sabe mostrar. Subconjunto do vocabulário do design system. */
export type NodeStatusId =
  "unsaved" | "render_failed" | "invalid" | "unvalidated" | "valid" | "render_done";

export interface NodeFacts {
  /** O editor tem alteração pendente **nesta** questão. Só o cliente sabe. */
  readonly unsaved?: boolean;
  /** `VALID` · `INVALID` · `UNVALIDATED`, como o banco guarda. */
  readonly validationStatus?: string | null;
  /** `DONE` · `FAILED` · … do último job desta questão, quando houve algum. */
  readonly lastRenderState?: string | null;
}

/**
 * O estado a mostrar, ou `null` quando não há nada que valha um indicador.
 *
 * `null` e não `unvalidated` para nó estrutural e para questão nunca tocada: um capítulo com selo
 * de validação seria ruído, e uma árvore em que **todo** nó tem indicador é uma árvore em que
 * nenhum indicador chama atenção — que é o oposto do que o indicador existe para fazer.
 */
export function statusFor(facts: NodeFacts): NodeStatusId | null {
  // Não salvo vem primeiro porque é o único que se perde ao clicar em outro nó.
  if (facts.unsaved === true) return "unsaved";

  // Render quebrado antes de validação: os dois são "algo está errado", mas o render falha por
  // motivo que a pessoa acabou de causar, e a validação costuma ser dívida antiga do acervo.
  if (facts.lastRenderState === "FAILED") return "render_failed";

  if (facts.validationStatus === "INVALID") return "invalid";
  if (facts.validationStatus === "VALID") return "valid";

  // `DONE` sem validação: o render passou, e é a única boa notícia disponível.
  if (facts.lastRenderState === "DONE") return "render_done";

  return null;
}

/**
 * `true` quando o nó merece aparecer num filtro de "com problema".
 *
 * Separado de `statusFor` de propósito: o filtro precisa pegar a questão **inválida com render
 * quebrado**, e essa aparece na árvore como `unsaved` se estiver sendo editada. Derivar o filtro
 * do rótulo escolhido faria o indicador esconder a questão do próprio filtro.
 */
export function hasProblem(facts: NodeFacts): boolean {
  return facts.lastRenderState === "FAILED" || facts.validationStatus === "INVALID";
}

/** O rótulo curto de cada estado, para o `title` e para o leitor de tela. */
export const NODE_STATUS_LABELS: Readonly<Record<NodeStatusId, string>> = {
  unsaved: "Não salva",
  render_failed: "Render falhou",
  invalid: "Incompleta ou inválida",
  unvalidated: "Não validada",
  valid: "Validada",
  render_done: "Render em dia",
};
