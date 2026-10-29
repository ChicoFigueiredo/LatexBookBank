import { NextResponse } from "next/server";

import { requireQuestionScope } from "@/shared/authorization/question-scope";

import { saveQuestion } from "@modules/questions/application/save-question";
import { PrismaValidationWriter } from "@modules/questions/infrastructure/prisma-validation-writer";
import { normalizeMetadata, type MetadataInput } from "@modules/questions/domain/question-metadata";
import {
  isQuestionType,
  QUESTION_STATUSES,
  type QuestionStatus,
} from "@modules/questions/domain/question-type";
import { PrismaQuestionRepository } from "@modules/questions/infrastructure/prisma-question-repository";
import type {
  QuestionDetailResponse,
  SaveQuestionResponse,
} from "@modules/questions/application/question-contract";

import { BadRequestError, readJson, toErrorResponse } from "../../../../http";

/**
 * Salva o conteúdo de uma questão.
 *
 * O cliente manda o `updatedAt` que tinha ao começar a editar. Se a linha mudou desde então, a
 * resposta é **409 com os dois lados** — a versão esperada e a encontrada —, nunca um 200 que
 * apagou o trabalho de outro processo (spec §42).
 */
export const dynamic = "force-dynamic";

const LATEX_LIMIT = 200_000;

function parseLatex(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new BadRequestError(`\`${field}\` precisa ser texto.`);
  if (value.length > LATEX_LIMIT) {
    throw new BadRequestError(`\`${field}\` passa de ${LATEX_LIMIT} caracteres.`);
  }
  return value;
}

/**
 * O subconjunto de metadados que veio no corpo.
 *
 * Campo ausente continua ausente: `normalizeMetadata` distingue "não mandou" de "mandou nulo", e
 * achatar os dois faria um `PATCH` de enunciado limpar a banca sem ninguém pedir.
 */
function metadataFrom(body: Record<string, unknown>): MetadataInput {
  const fields = [
    "difficulty",
    "year",
    "board",
    "institution",
    "role",
    "roleLevel",
    "publisher",
    "videoUrl",
  ] as const;

  return Object.fromEntries(
    fields.filter((field) => body[field] !== undefined).map((field) => [field, body[field]]),
  ) as MetadataInput;
}

/**
 * Os metadados desta questão.
 *
 * Carregados quando a aba abre, e não junto com a árvore: o DTO da árvore leva `difficultyLabel` e
 * a origem já formatados, que é o que a lista desenha. Os campos crus só interessam a quem vai
 * editá-los, e engordar o DTO faria toda abertura de publicação pagar por eles.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; questionId: string }> },
) {
  const { id, questionId } = await params;

  try {
    await requireQuestionScope(id, questionId);

    const snapshot = await new PrismaQuestionRepository().findById(questionId);
    if (snapshot === null) {
      return NextResponse.json(
        { error: "not_found", message: "Esta questão não existe." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      version: snapshot.updatedAt.toISOString(),
      metadata: {
        difficulty: snapshot.difficulty,
        year: snapshot.year,
        board: snapshot.board,
        institution: snapshot.institution,
        role: snapshot.role,
        roleLevel: snapshot.roleLevel,
        publisher: snapshot.publisher,
        videoUrl: snapshot.videoUrl,
      },
    } satisfies QuestionDetailResponse);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; questionId: string }> },
) {
  const { id, questionId } = await params;

  try {
    await requireQuestionScope(id, questionId);

    const body = await readJson(request);

    // `version` no contrato do cliente, `updatedAt` no banco. O valor é o mesmo; o nome muda
    // porque a coluna é detalhe de persistência e o token de concorrência é contrato — e porque
    // o DTO da árvore proíbe timestamps justamente para não vazar schema (auditoria §40).
    const expected = body["expectedVersion"];
    if (typeof expected !== "string") {
      throw new BadRequestError("`expectedVersion` é obrigatório (ISO-8601).");
    }
    const expectedUpdatedAt = new Date(expected);
    if (Number.isNaN(expectedUpdatedAt.getTime())) {
      throw new BadRequestError("`expectedVersion` não é uma data ISO-8601 válida.");
    }

    /**
     * O tipo pode mudar depois — e **sem perder conteúdo** (protótipo, 2226).
     *
     * Antes ele era escolhido na criação e era para sempre. Isso fazia o seletor de tipo uma
     * decisão pesada num momento em que a pessoa muitas vezes ainda não leu a questão inteira: na
     * dúvida entre "escolha simples" e "múltipla escolha", errar significava recriar e redigitar.
     *
     * Nada é apagado na troca, e não por generosidade — é o que o app já fazia. A discursiva
     * **esconde** a aba de alternativas em vez de excluí-las (`panesFor`), então voltar atrás
     * devolve tudo. E `MULTIPLE_CORRECT` → `MULTIPLE_CHOICE` com três corretas não é bloqueado
     * aqui: vira erro de validação (`multiple_correct_options`), que é onde a inconsistência
     * pertence — a pessoa vê o que ficou errado em vez de levar uma recusa sem explicação.
     */
    const type = body["type"];
    if (type !== undefined && (typeof type !== "string" || !isQuestionType(type))) {
      throw new BadRequestError("`type` precisa ser um tipo de questão conhecido.");
    }

    // Conferir (D40): `READY` tira a questão de *a revisar*; voltar a `DRAFT` também vale.
    const status = body["status"];
    if (status !== undefined && (typeof status !== "string" || !(QUESTION_STATUSES as readonly string[]).includes(status))) {
      throw new BadRequestError("`status` precisa ser DRAFT, READY ou ARCHIVED.");
    }

    const nickname = body["nickname"];
    if (nickname !== undefined && nickname !== null && typeof nickname !== "string") {
      throw new BadRequestError("`nickname` precisa ser texto ou nulo.");
    }

    const result = await saveQuestion(
      new PrismaQuestionRepository(),
      {
        questionId,
        expectedUpdatedAt,
        edit: {
          ...(parseLatex(body["statementLatex"], "statementLatex") !== undefined
            ? { statementLatex: parseLatex(body["statementLatex"], "statementLatex") as string }
            : {}),
          ...(parseLatex(body["solutionLatex"], "solutionLatex") !== undefined
            ? { solutionLatex: parseLatex(body["solutionLatex"], "solutionLatex") as string }
            : {}),
          ...(parseLatex(body["complementLatex"], "complementLatex") !== undefined
            ? { complementLatex: parseLatex(body["complementLatex"], "complementLatex") as string }
            : {}),
          ...(nickname !== undefined ? { nickname: nickname as string | null } : {}),
          ...(type !== undefined ? { type } : {}),
          ...(status !== undefined ? { status: status as QuestionStatus } : {}),
          // Os metadados vão pelo mesmo `PATCH` e pela mesma versão. Um segundo caminho de escrita
          // teria o próprio `updatedAt` a comparar — duas versões da mesma questão brigando.
          ...normalizeMetadata(metadataFrom(body)),
        },
      },
      // O caso de uso revalida depois de gravar, sem mover a versão que esta resposta devolve.
      new PrismaValidationWriter(),
    );

    return NextResponse.json({
      id: result.snapshot.id,
      version: result.snapshot.updatedAt.toISOString(),
      // O cliente precisa saber se houve escrita: sem isto, o indicador de "salvo" piscaria a
      // cada autosave mesmo sem nada ter mudado, e viraria ruído que ninguém mais lê.
      written: result.written,
    } satisfies SaveQuestionResponse);
  } catch (error) {
    return toErrorResponse(error);
  }
}
