/**
 * O contexto que o agente enxerga — **montado pelo usuário, item a item**.
 *
 * Esta é a decisão que separa este painel de um chat com acesso ao banco: nada entra sem aparecer
 * na barra, e tudo que entrou sai com um clique. Um agente que decide sozinho o que ler é um
 * agente cujo custo ninguém consegue prever e cujo vazamento ninguém consegue auditar — e o
 * acervo tem vinte anos de questões que o Chico não quer mandar inteiras para um endpoint remoto
 * porque o modelo achou que seria útil.
 *
 * Ver spec §14.6 · issue #93.
 */

export const CONTEXT_KINDS = [
  "question",
  "options",
  "metadata",
  "selection",
  "diagnostics",
] as const;
export type ContextKind = (typeof CONTEXT_KINDS)[number];

export interface ContextItem {
  /** Estável por origem: anexar a mesma questão duas vezes não a duplica. */
  readonly id: string;
  readonly kind: ContextKind;
  /** O que a barra mostra. Curto — é um chip, não um parágrafo. */
  readonly label: string;
  /** O que de fato vai para o modelo. */
  readonly content: string;
  /**
   * `false` para o que o painel anexou por conta própria ao abrir sobre uma questão.
   *
   * O item continua **removível** — a diferença é só que ele não foi um gesto do usuário, e a
   * barra o marca para que ninguém descubra depois que mandou algo sem querer.
   */
  readonly explicit: boolean;
}

export interface AgentContext {
  readonly items: readonly ContextItem[];
}

export const EMPTY_CONTEXT: AgentContext = { items: [] };

/**
 * O teto de tamanho do contexto.
 *
 * Não é limite de token — é limite de **surpresa**. Uma questão de prova discursiva com resolução
 * passa de 20 kB, e três delas anexadas sem aviso viram uma conta que o usuário só descobre na
 * fatura. Ao bater no teto o painel recusa e diz o que remover.
 */
export const MAX_CONTEXT_CHARS = 60_000;

export class ContextTooLargeError extends Error {
  constructor(
    readonly attempted: number,
    readonly limit: number,
  ) {
    super(
      `O contexto passaria de ${limit.toLocaleString("pt-BR")} caracteres ` +
        `(${attempted.toLocaleString("pt-BR")}). Remova algum item antes de anexar outro.`,
    );
    this.name = "ContextTooLargeError";
  }
}

export const contextSize = (context: AgentContext): number =>
  context.items.reduce((total, item) => total + item.content.length, 0);

/**
 * Anexa, ou substitui se o id já estiver lá.
 *
 * Substituir e não duplicar: anexar a seleção do Monaco duas vezes é o gesto mais provável de
 * todos, e duas cópias da mesma seleção no contexto seriam pagas duas vezes sem servir para nada.
 * A posição original é preservada — um item que se atualiza não deve pular para o fim da barra.
 */
export function attach(context: AgentContext, item: ContextItem): AgentContext {
  const existing = context.items.findIndex((candidate) => candidate.id === item.id);
  const others = existing === -1 ? context.items : context.items.filter((_, i) => i !== existing);

  const size =
    others.reduce((total, entry) => total + entry.content.length, 0) + item.content.length;
  if (size > MAX_CONTEXT_CHARS) throw new ContextTooLargeError(size, MAX_CONTEXT_CHARS);

  if (existing === -1) return { items: [...context.items, item] };

  const items = [...context.items];
  items[existing] = item;
  return { items };
}

export const detach = (context: AgentContext, id: string): AgentContext => ({
  items: context.items.filter((item) => item.id !== id),
});

export const clearContext = (): AgentContext => EMPTY_CONTEXT;

/**
 * O contexto como o modelo o recebe.
 *
 * Cada item vai rotulado e delimitado. Sem o rótulo o modelo não distingue o enunciado da questão
 * do trecho selecionado no editor, e passa a responder sobre o pedaço errado — que é o modo de
 * falha mais comum e o mais difícil de perceber, porque a resposta continua parecendo plausível.
 */
export function renderContext(context: AgentContext): string {
  if (context.items.length === 0) return "";

  return context.items
    .map((item) => `## ${item.label} (${item.kind})\n\n${item.content}`)
    .join("\n\n---\n\n");
}

/**
 * A seleção do editor como item de contexto.
 *
 * Id fixo — anexar de novo **substitui**. Selecionar, anexar, mudar a seleção e anexar outra vez
 * é a sequência normal de uso; guardar as duas encheria a barra de trechos que o usuário já não
 * está olhando, e ele pagaria por todos.
 *
 * Vive no domínio e não na tela porque a regra é do dado: o rótulo tem que dizer onde o trecho
 * estava, senão o modelo responde sobre um `\frac` sem saber de qual linha.
 */
export const SELECTION_ITEM_ID = "editor-selection";

export function selectionItem(selection: {
  readonly text: string;
  readonly startLine: number;
  readonly endLine: number;
}): ContextItem {
  const range =
    selection.startLine === selection.endLine
      ? `linha ${selection.startLine}`
      : `linhas ${selection.startLine}–${selection.endLine}`;

  return {
    id: SELECTION_ITEM_ID,
    kind: "selection",
    label: `Seleção (${range})`,
    content: selection.text,
    explicit: true,
  };
}

/** Rótulos de tela, num lugar só — a barra e o menu de anexar precisam concordar. */
export const CONTEXT_KIND_LABELS: Readonly<Record<ContextKind, string>> = {
  question: "Questão",
  options: "Alternativas",
  metadata: "Metadados",
  selection: "Seleção",
  diagnostics: "Diagnósticos",
};
