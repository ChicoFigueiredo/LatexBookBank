import { z } from "zod";

import { DIFFICULTIES, isDifficulty } from "@modules/questions/domain/question-type";

/**
 * O que o agente pode **propor** — e nada além.
 *
 * Um patch é o modelo pedindo para mudar o banco. A whitelist é a diferença entre "ele propõe o
 * enunciado" e "ele propõe qualquer coluna que exista": sem ela, um patch com `id`,
 * `validationStatus` ou `legacyId` passaria por uma revisão de diff de LaTeX sem ninguém reparar.
 * O que não está aqui não é recusado depois — ele simplesmente não tem como ser expresso.
 *
 * Zod entra **aqui**, e só aqui, pelo motivo que o resto do projeto adiou: este schema é rico,
 * versionado, e a entrada vem de um modelo de linguagem, que é a fonte menos confiável do
 * sistema. Nas outras fronteiras, três campos de vocabulário fechado não pagavam a dependência.
 *
 * Ver spec §35 · §36 · issue #99.
 */

/**
 * A versão do formato.
 *
 * Um patch guardado hoje pode ser lido depois de o schema mudar — na revisão, no histórico, num
 * relatório. Sem versão, "esse campo sumiu" e "esse patch é de antes" ficam indistinguíveis.
 */
export const PATCH_SCHEMA_VERSION = 1;

/** Os campos de texto da questão que o agente pode propor mudar. */
export const PATCHABLE_QUESTION_FIELDS = [
  "statementLatex",
  "solutionLatex",
  "complementLatex",
  "nickname",
] as const;

export type PatchableQuestionField = (typeof PATCHABLE_QUESTION_FIELDS)[number];

/**
 * Os metadados propostos.
 *
 * `originalLatex`, `legacyId`, `status` e `validationStatus` **não** estão aqui, e cada ausência
 * é uma decisão: o primeiro é a fonte preservada (D29), os dois seguintes são identidade de
 * import, e `validationStatus` é resultado de validação — deixar o agente escrevê-lo seria deixá-lo
 * declarar-se aprovado.
 */
const metadataPatchSchema = z
  .object({
    // A escala legada é 0 · 2 · 5 · 7 · 10, e **não** 1–5. Vem de `isDifficulty` em vez de uma
    // união literal repetida aqui: duas listas divergem, e a que diverge é sempre a copiada.
    difficulty: z
      .number()
      .int()
      .refine(isDifficulty, `Dificuldade precisa ser uma de ${DIFFICULTIES.join(", ")}.`)
      .optional(),
    year: z.number().int().min(1900).max(2100).nullable().optional(),
    board: z.string().max(200).nullable().optional(),
    institution: z.string().max(200).nullable().optional(),
    role: z.string().max(200).nullable().optional(),
    roleLevel: z.string().max(200).nullable().optional(),
    publisher: z.string().max(200).nullable().optional(),
    videoUrl: z.url().max(500).nullable().optional(),
  })
  .strict();

/** Um campo de texto da questão. `null` só é aceito em `nickname` — os demais têm default `""`. */
const questionFieldPatchSchema = z
  .object({
    field: z.enum(PATCHABLE_QUESTION_FIELDS),
    // 200 kB é mais que qualquer questão do acervo e menos que um despejo acidental.
    value: z.string().max(200_000),
  })
  .strict();

/**
 * Uma alternativa, por **id**.
 *
 * Nunca por letra: a letra é projeção da posição (D9/§8.5), e um patch endereçado a "a
 * alternativa c)" aplicado depois de uma reordenação escreveria na alternativa errada — em
 * silêncio, e com o gabarito parecendo certo.
 */
const optionPatchSchema = z
  .object({
    optionId: z.string().min(1).max(200),
    statementLatex: z.string().max(50_000).optional(),
    isCorrect: z.boolean().optional(),
  })
  .strict()
  .refine(
    (patch) => patch.statementLatex !== undefined || patch.isCorrect !== undefined,
    "Um patch de alternativa precisa mudar alguma coisa.",
  );

/** Nova ordem das alternativas, por id. */
const reorderPatchSchema = z
  .object({ optionIds: z.array(z.string().min(1).max(200)).min(2).max(64) })
  .strict();

/** Tags por **nome**: o agente não conhece id de tag, e não deveria. */
const tagsPatchSchema = z.object({ names: z.array(z.string().min(1).max(80)).max(32) }).strict();

export const questionPatchSchema = z
  .object({
    schemaVersion: z.literal(PATCH_SCHEMA_VERSION),
    /**
     * O que o agente entendeu, em uma frase.
     *
     * Obrigatório de propósito. Quem revisa um diff precisa saber o que o agente **achou** que
     * estava fazendo: um diff correto por acidente e um diff correto de propósito são a mesma
     * imagem na tela, e a diferença aparece na frase.
     */
    summary: z.string().min(1).max(500),
    /** Avisos do próprio agente: o que ele mudou com pouca confiança. */
    warnings: z.array(z.string().max(300)).max(20).default([]),

    fields: z.array(questionFieldPatchSchema).max(4).default([]),
    options: z.array(optionPatchSchema).max(64).default([]),
    reorder: reorderPatchSchema.optional(),
    metadata: metadataPatchSchema.optional(),
    tags: tagsPatchSchema.optional(),
  })
  .strict()
  .refine(hasAnyChange, "Um patch sem mudança nenhuma não é uma proposta.")
  .refine(
    (patch) => new Set(patch.fields.map((entry) => entry.field)).size === patch.fields.length,
    "O mesmo campo aparece duas vezes — qual das duas versões valeria?",
  )
  .refine(
    (patch) => new Set(patch.options.map((entry) => entry.optionId)).size === patch.options.length,
    "A mesma alternativa aparece duas vezes.",
  )
  .refine(
    (patch) =>
      patch.reorder === undefined ||
      new Set(patch.reorder.optionIds).size === patch.reorder.optionIds.length,
    "A nova ordem repete uma alternativa.",
  )
  .refine(
    // Duas corretas num patch de múltipla escolha é o erro que a spec §8.5 mais teme, e o agente
    // o comete com frequência ao "corrigir" o gabarito. A validação final é do plugin, mas
    // recusar aqui poupa uma tela de revisão inteira.
    (patch) => patch.options.filter((entry) => entry.isCorrect === true).length <= 1,
    "O patch marca mais de uma alternativa como correta.",
  );

export type QuestionPatch = z.infer<typeof questionPatchSchema>;

function hasAnyChange(patch: {
  fields: unknown[];
  options: unknown[];
  reorder?: unknown;
  metadata?: unknown;
  tags?: unknown;
}): boolean {
  return (
    patch.fields.length > 0 ||
    patch.options.length > 0 ||
    patch.reorder !== undefined ||
    patch.metadata !== undefined ||
    patch.tags !== undefined
  );
}

export class PatchRejectedError extends Error {
  constructor(
    message: string,
    readonly issues: readonly string[],
  ) {
    super(message);
    this.name = "PatchRejectedError";
  }
}

/**
 * Valida o que o modelo propôs.
 *
 * A mensagem de erro volta **para o modelo**, não só para o log: ele costuma acertar na segunda
 * tentativa quando sabe qual campo recusou e por quê. Daí as mensagens serem instruções em vez de
 * códigos.
 */
export function parseQuestionPatch(raw: unknown): QuestionPatch {
  const result = questionPatchSchema.safeParse(raw);

  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const where = issue.path.length > 0 ? `\`${issue.path.join(".")}\`: ` : "";
      return `${where}${issue.message}`;
    });
    throw new PatchRejectedError(`O patch foi recusado. ${issues.join(" · ")}`, issues);
  }

  return result.data;
}

/** Os campos que o patch toca, para a tela listar antes de mostrar diff nenhum. */
export function affectedFields(patch: QuestionPatch): readonly string[] {
  const touched: string[] = patch.fields.map((entry) => entry.field);

  if (patch.options.length > 0) touched.push(`${patch.options.length} alternativa(s)`);
  if (patch.reorder) touched.push("ordem das alternativas");
  if (patch.metadata) touched.push(...Object.keys(patch.metadata));
  if (patch.tags) touched.push("tags");

  return touched;
}
