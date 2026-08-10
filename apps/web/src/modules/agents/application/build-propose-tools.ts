import {
  PATCHABLE_QUESTION_FIELDS,
  PATCH_SCHEMA_VERSION,
  parseQuestionPatch,
  type QuestionPatch,
} from "../domain/question-patch";
import { affectedFields } from "../domain/question-patch";
import type { AgentTool } from "../domain/tool-contract";

/**
 * As tools de proposta — que **não escrevem**.
 *
 * Cada uma valida o que o modelo mandou contra a whitelist e guarda o patch numa bandeja. Quem
 * decide o que fazer com ele é o humano, na tela de revisão: nada aqui toca o banco, e a ausência
 * de qualquer caminho de escrita continua sendo verificada pelo teste de guarda.
 *
 * A resposta que volta **para o modelo** é curta de propósito: "recebi, o usuário vai revisar".
 * Devolver o patch inteiro convidaria o modelo a comentá-lo, e um turno inteiro se perde com o
 * agente discutindo consigo mesmo o que já propôs.
 *
 * Ver spec §35 · §36 · issue #99.
 */

export const PROPOSE_TOOL_NAMES = [
  "propose_question_patch",
  "propose_option_patch",
  "propose_metadata_patch",
  "propose_tags",
  "propose_reorder_options",
] as const;

export type ProposeToolName = (typeof PROPOSE_TOOL_NAMES)[number];

/** Recebe o patch validado. Uma bandeja, não um repositório. */
export interface PatchCollector {
  /** `false` quando o patch já estava na bandeja. */
  offer(patch: QuestionPatch): boolean;
}

/**
 * A bandeja **descarta repetição**.
 *
 * Não é zelo teórico: contra o Ollama real, o modelo propôs o mesmo patch três vezes, uma por
 * rodada, mesmo com a resposta da tool pedindo para não repetir. Sem o descarte, a tela de
 * revisão mostraria três propostas idênticas e o usuário teria que comparar as três para
 * descobrir que são a mesma.
 *
 * A comparação é sobre o **conteúdo** do patch, e ignora `summary` e `warnings`: o modelo
 * reescreve a frase a cada tentativa, e duas frases diferentes para a mesma mudança continuam
 * sendo a mesma mudança.
 */
export function createPatchCollector(): PatchCollector & { readonly patches: QuestionPatch[] } {
  const patches: QuestionPatch[] = [];
  const seen = new Set<string>();

  return {
    patches,
    offer: (patch) => {
      const { summary: _s, warnings: _w, ...content } = patch;
      const key = JSON.stringify(content);
      if (seen.has(key)) return false;

      seen.add(key);
      patches.push(patch);
      return true;
    },
  };
}

const COMMON = {
  summary: {
    type: "string",
    description: "Em uma frase, o que você entendeu e o que está propondo.",
  },
  warnings: {
    type: "array",
    items: { type: "string" },
    description: "O que você mudou com pouca confiança, se houver.",
  },
} as const;

/**
 * Os `execute` são `async` de propósito, e não `() => Promise.resolve(...)`.
 *
 * `offer` recusa lançando. Com a segunda forma a exceção sairia **síncrona**, quebrando o
 * contrato de que `execute` devolve promessa e furando qualquer `.catch()` de quem chama — foi
 * um teste que apontou isso.
 */
const asTool = (
  name: ProposeToolName,
  description: string,
  inputSchema: Record<string, unknown>,
  execute: (input: unknown) => Promise<string>,
): AgentTool => ({ name, description, inputSchema, execute });

export function buildProposeTools(collector: PatchCollector): readonly AgentTool[] {
  /** Valida, guarda e responde curto. */
  const offer = (patch: unknown): string => {
    const parsed = parseQuestionPatch(patch);

    if (!collector.offer(parsed)) {
      // Dizer que já está lá é melhor que aceitar em silêncio: o modelo repete quando acha que a
      // primeira não chegou, e a confirmação encerra o assunto.
      return "Esta mesma proposta já foi registrada. Responda ao usuário em texto agora.";
    }

    return (
      `Proposta recebida: ${parsed.summary}\n` +
      `Campos afetados: ${affectedFields(parsed).join(", ")}.\n` +
      "O usuário vai revisar e decidir. Não proponha a mesma mudança de novo."
    );
  };

  /** O modelo esquece `schemaVersion` quase sempre; preenchê-la é mais útil que recusar. */
  const withVersion = (partial: Record<string, unknown>): Record<string, unknown> => ({
    schemaVersion: PATCH_SCHEMA_VERSION,
    ...partial,
  });

  const asRecord = (input: unknown): Record<string, unknown> =>
    typeof input === "object" && input !== null && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};

  return [
    asTool(
      "propose_question_patch",
      "Propõe nova redação para enunciado, resolução, complemento ou apelido da questão aberta.",
      {
        type: "object",
        properties: {
          ...COMMON,
          fields: {
            type: "array",
            description: "Um item por campo alterado.",
            items: {
              type: "object",
              properties: {
                field: { type: "string", enum: [...PATCHABLE_QUESTION_FIELDS] },
                value: { type: "string", description: "O texto completo do campo, já corrigido." },
              },
              required: ["field", "value"],
              additionalProperties: false,
            },
          },
        },
        required: ["summary", "fields"],
        additionalProperties: false,
      },
      async (input) => offer(withVersion(asRecord(input))),
    ),

    asTool(
      "propose_option_patch",
      "Propõe nova redação ou nova marcação de gabarito para alternativas, endereçadas por id.",
      {
        type: "object",
        properties: {
          ...COMMON,
          options: {
            type: "array",
            items: {
              type: "object",
              properties: {
                // Por id e nunca por letra: a letra é projeção da posição (D9/§8.5), e um patch
                // endereçado a "a alternativa c)" escreveria na errada depois de uma reordenação.
                optionId: { type: "string", description: "Id da alternativa, como veio da tool." },
                statementLatex: { type: "string" },
                isCorrect: { type: "boolean" },
              },
              required: ["optionId"],
              additionalProperties: false,
            },
          },
        },
        required: ["summary", "options"],
        additionalProperties: false,
      },
      async (input) => offer(withVersion(asRecord(input))),
    ),

    asTool(
      "propose_metadata_patch",
      "Propõe mudança nos metadados editoriais: banca, ano, instituição, cargo, dificuldade.",
      {
        type: "object",
        properties: {
          ...COMMON,
          metadata: {
            type: "object",
            properties: {
              difficulty: {
                type: "integer",
                description: "0, 2, 5, 7 ou 10 — a escala do acervo.",
              },
              year: { type: "integer" },
              board: { type: "string" },
              institution: { type: "string" },
              role: { type: "string" },
              roleLevel: { type: "string" },
              publisher: { type: "string" },
              videoUrl: { type: "string" },
            },
            additionalProperties: false,
          },
        },
        required: ["summary", "metadata"],
        additionalProperties: false,
      },
      async (input) => offer(withVersion(asRecord(input))),
    ),

    asTool(
      "propose_tags",
      "Propõe o conjunto completo de tags da questão. Manda a lista inteira, não só as novas.",
      {
        type: "object",
        properties: {
          ...COMMON,
          tags: {
            type: "object",
            properties: { names: { type: "array", items: { type: "string" } } },
            required: ["names"],
            additionalProperties: false,
          },
        },
        required: ["summary", "tags"],
        additionalProperties: false,
      },
      async (input) => offer(withVersion(asRecord(input))),
    ),

    asTool(
      "propose_reorder_options",
      "Propõe nova ordem para as alternativas, pela lista completa de ids na ordem desejada.",
      {
        type: "object",
        properties: {
          ...COMMON,
          reorder: {
            type: "object",
            properties: { optionIds: { type: "array", items: { type: "string" } } },
            required: ["optionIds"],
            additionalProperties: false,
          },
        },
        required: ["summary", "reorder"],
        additionalProperties: false,
      },
      async (input) => offer(withVersion(asRecord(input))),
    ),
  ];
}
