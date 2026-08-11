/**
 * O contrato das tools do agente.
 *
 * Três regras negativas moram aqui, e são o motivo de o arquivo existir:
 *
 * 1. **A lista é fechada e definida pelo servidor.** O modelo escolhe qual chamar, nunca o que
 *    existe. Uma tool que o modelo pudesse declarar seria uma tool que o modelo pode inventar.
 * 2. **Todo input é validado antes de executar.** O que chega do modelo é texto que ele achou
 *    plausível — um id inventado, um número onde se esperava string, um objeto vazio. Passar isso
 *    direto para o repositório é como um id de outra publicação vira leitura indevida.
 * 3. **Todo output tem teto.** O log de um `pgfplots` passa de 1 MB; devolvê-lo inteiro estoura a
 *    janela do modelo, custa caro e não responde nada melhor do que os primeiros milhares de
 *    caracteres.
 *
 * Nenhuma tool de escrita existe, e isso não é uma limitação a afrouxar depois: um prompt pedindo
 * para não escrever é uma sugestão; uma tool que não existe é uma garantia. Há teste de guarda.
 *
 * Ver spec §35 · issue #95.
 */

/** A lista fechada. Acrescentar aqui é uma decisão de produto, não um detalhe de implementação. */
export const READ_ONLY_TOOL_NAMES = [
  "get_current_question",
  "get_question_options",
  "get_question_metadata",
  "get_source_anchor",
  "get_render_diagnostics",
  "search_questions",
  "validate_question",
] as const;

export type ReadOnlyToolName = (typeof READ_ONLY_TOOL_NAMES)[number];

export const isReadOnlyToolName = (name: string): name is ReadOnlyToolName =>
  (READ_ONLY_TOOL_NAMES as readonly string[]).includes(name);

/**
 * O teto de saída de uma tool.
 *
 * 8 000 caracteres é cerca de duas mil palavras — mais que qualquer questão do acervo, e menos
 * que um log de compilação. O corte é marcado no texto: um output truncado em silêncio faz o
 * modelo concluir a partir de metade da evidência, e a resposta continua soando completa.
 */
export const MAX_TOOL_OUTPUT_CHARS = 8_000;

export function truncateOutput(text: string, limit = MAX_TOOL_OUTPUT_CHARS): string {
  if (text.length <= limit) return text;

  const cut = text.slice(0, limit);
  return `${cut}\n\n[…truncado: ${text.length - limit} caracteres a mais. Peça um recorte mais específico.]`;
}

export class ToolInputError extends Error {
  constructor(
    readonly toolName: string,
    message: string,
  ) {
    super(message);
    this.name = "ToolInputError";
  }
}

export interface AgentTool {
  /**
   * `string`, e não a união fechada de leitura.
   *
   * As tools de proposta (Fase 9) têm nomes próprios e também não escrevem — elas devolvem um
   * patch para a tela. Amarrar o tipo à lista de leitura obrigaria a um elenco em cada uma, que é
   * pior que nenhuma checagem: um elenco esconde a diferença em vez de declará-la. Quem garante a
   * lista fechada de leitura é `buildAgentTools`, com teste de guarda.
   */
  readonly name: string;
  readonly description: string;
  /** JSON Schema — é o que vai para o endpoint como `function.parameters`. */
  readonly inputSchema: Record<string, unknown>;
  /** Já valida o input; o resultado sai truncado no teto. */
  readonly execute: (input: unknown) => Promise<string>;
}

/* ────────────────────────────── validação de input ─────────────────────────────── */

const asRecord = (toolName: string, input: unknown): Record<string, unknown> => {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new ToolInputError(toolName, "O input precisa ser um objeto.");
  }
  return input as Record<string, unknown>;
};

/**
 * Um id obrigatório.
 *
 * Só formato — a existência é assunto do repositório. O teto de tamanho está aqui porque um id de
 * 40 kB não é um id, é uma tentativa de empurrar conteúdo por um campo que ninguém inspeciona.
 */
export function requireId(toolName: string, input: unknown, field: string): string {
  const value = asRecord(toolName, input)[field];

  if (typeof value !== "string" || value.trim() === "") {
    throw new ToolInputError(toolName, `\`${field}\` é obrigatório e precisa ser um texto.`);
  }
  if (value.length > 200) {
    throw new ToolInputError(toolName, `\`${field}\` é longo demais para um identificador.`);
  }
  return value.trim();
}

/** Texto livre com teto — busca, filtro. */
export function requireText(
  toolName: string,
  input: unknown,
  field: string,
  maxLength = 200,
): string {
  const value = asRecord(toolName, input)[field];

  if (typeof value !== "string" || value.trim() === "") {
    throw new ToolInputError(toolName, `\`${field}\` é obrigatório e precisa ser um texto.`);
  }
  if (value.length > maxLength) {
    throw new ToolInputError(toolName, `\`${field}\` passa de ${maxLength} caracteres.`);
  }
  return value.trim();
}

/**
 * Um inteiro opcional dentro de faixa.
 *
 * Modelos mandam `"10"` com frequência, e recusar seria pedantismo — o valor é inequívoco. O que
 * **não** se aceita é `10.5` ou `"dez"`: o primeiro seria arredondado adivinhando, e o segundo
 * não é número.
 */
export function optionalInteger(
  toolName: string,
  input: unknown,
  field: string,
  { min, max, fallback }: { min: number; max: number; fallback: number },
): number {
  const raw = asRecord(toolName, input)[field];
  if (raw === undefined || raw === null) return fallback;

  const value = typeof raw === "string" ? Number(raw) : raw;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ToolInputError(toolName, `\`${field}\` precisa ser um número inteiro.`);
  }
  if (value < min || value > max) {
    throw new ToolInputError(toolName, `\`${field}\` precisa estar entre ${min} e ${max}.`);
  }
  return value;
}
