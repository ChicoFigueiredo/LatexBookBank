/**
 * O turno do agente: o que ele é, quando para, e o que fica registrado.
 *
 * O modo `ASK` é o único da Fase 8, e é somente leitura por construção — as tools disponíveis não
 * incluem escrita. Os outros modos (`REVIEW`, `FIX_LATEX`, `ENRICH`, `STRUCTURE`) chegam com o
 * fluxo de patch e aprovação, na Fase 9; declará-los aqui desde já é o que evita que o primeiro
 * deles seja enfiado como um `if` dentro do runner.
 *
 * Ver spec §14 · §35 · issue #97.
 */

export const AGENT_MODES = ["ASK", "REVIEW", "FIX_LATEX", "ENRICH", "STRUCTURE"] as const;
export type AgentMode = (typeof AGENT_MODES)[number];

export const AGENT_RUN_STATES = ["RUNNING", "DONE", "FAILED", "ABORTED"] as const;
export type AgentRunState = (typeof AGENT_RUN_STATES)[number];

/**
 * O teto de idas e voltas com o modelo.
 *
 * Cada volta é uma chamada paga e uma rodada de tools. Um modelo que se enrosca — e modelos
 * locais se enroscam — chamaria a mesma tool indefinidamente sem o teto, e quem paga a conta só
 * descobriria depois. Três é o bastante para "leia a questão, veja as alternativas, responda".
 */
export const MAX_TOOL_ITERATIONS = 3;

export interface ToolCallRecord {
  readonly name: string;
  /** Input **resumido**: o que a interface mostra no card, não o objeto inteiro. */
  readonly inputSummary: string;
  readonly outputChars: number;
  readonly durationMs: number;
  readonly status: "ok" | "error";
  /** Preenchido só quando `status` é `error`. */
  readonly error?: string;
}

export interface AgentRunRecord {
  readonly mode: AgentMode;
  readonly providerId: string;
  readonly model: string;
  readonly state: AgentRunState;
  readonly promptSummary: string;
  readonly answerSummary: string;
  readonly toolCalls: readonly ToolCallRecord[];
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly durationMs: number;
  readonly error?: string;
}

/**
 * O que vai para o log.
 *
 * **Resumo, nunca transcrição.** O prompt completo carrega o contexto que o usuário anexou —
 * enunciado de prova, resolução inteira — e um log de auditoria não é lugar para isso: ele
 * sobrevive a limpezas de tela, vai para backup e é lido por quem está investigando outra coisa.
 * Quem quer o texto tem a conversa aberta.
 */
export const SUMMARY_CHARS = 280;

export function summarize(text: string, limit = SUMMARY_CHARS): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= limit ? flat : `${flat.slice(0, limit)}…`;
}

/** Input de tool no card: chaves e valores curtos, sem despejar o objeto. */
export function summarizeToolInput(input: unknown): string {
  if (typeof input !== "object" || input === null) return summarize(String(input), 80);

  return summarize(
    Object.entries(input as Record<string, unknown>)
      .map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`)
      .join(" · "),
    120,
  );
}

/**
 * O prompt de sistema do modo `ASK`.
 *
 * Diz o que o agente **não** pode fazer, e diz por quê. Não é o que garante a regra — quem
 * garante é a ausência de tool de escrita —, mas um modelo que sabe que não pode escrever para de
 * prometer que escreveu, que é o modo de falha que mais confunde quem lê a resposta.
 *
 * Português porque o acervo, o usuário e as questões são em português; pedir raciocínio em inglês
 * sobre enunciado em português custa qualidade sem devolver nada.
 */
export const ASK_SYSTEM_PROMPT = [
  "Você é um assistente editorial de um banco de questões em LaTeX, em português do Brasil.",
  "",
  "Você tem acesso **somente de leitura**. Não existe nenhuma ferramenta de escrita: você não",
  "consegue alterar questão, alternativa, metadado ou banco. Nunca diga que alterou, salvou ou",
  "corrigiu algo — descreva a mudança que você recomenda e deixe a decisão com o usuário.",
  "",
  "Use as ferramentas para ler o que precisar antes de responder. Os ids vêm do contexto",
  "anexado pelo usuário; não invente id.",
  "",
  "Sobre alternativas: a letra (a, b, c…) é projeção da posição, não identidade. Ao apontar uma",
  "alternativa, cite também o trecho dela — se a ordem mudar, a letra muda junto.",
  "",
  "Responda de forma direta. Se a evidência não bastar para concluir, diga o que falta.",
].join("\n");

/**
 * O prompt de sistema quando o endpoint **não** faz tool calling.
 *
 * A maioria dos modelos abertos não faz, e é o caso do Ollama por padrão. Mandar tools assim dá
 * 400 em alguns endpoints e silêncio em outros; mandar nenhuma e não avisar faz o modelo
 * prometer que vai consultar algo que ele não consegue consultar. Dizer que não há ferramenta é
 * o que faz a resposta se limitar honestamente ao que está anexado.
 */
export const ASK_SYSTEM_PROMPT_NO_TOOLS = [
  ASK_SYSTEM_PROMPT.replace(
    "Use as ferramentas para ler o que precisar antes de responder. Os ids vêm do contexto\nanexado pelo usuário; não invente id.",
    "Você **não** tem ferramentas neste turno: responda apenas com o que estiver no contexto\nanexado. Se faltar informação, diga exatamente o que o usuário precisa anexar.",
  ),
].join("\n");
