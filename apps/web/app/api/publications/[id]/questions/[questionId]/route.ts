import { NextResponse } from "next/server";

import { resolveQuestionScope } from "@/shared/authorization/question-scope";

import { QuestionNotFoundError, saveQuestion } from "@modules/questions/application/save-question";
import { validateAndPersist } from "@modules/questions/application/validate-question";
import {
  PrismaValidationWriter,
  questionForValidation,
} from "@modules/questions/infrastructure/prisma-validation-writer";
import {
  MetadataError,
  normalizeMetadata,
  type MetadataInput,
} from "@modules/questions/domain/question-metadata";
import { PrismaQuestionRepository } from "@modules/questions/infrastructure/prisma-question-repository";
import { ConcurrencyConflictError } from "@/shared/ports/repository";

import { BadRequestError, readJson, toErrorResponse } from "../../../../tree-http";

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
    const escopo = await resolveQuestionScope(id, questionId);
    if (escopo === null) {
      // 404 e não 403: distinguir "existe, mas não é desta publicação" de "não existe" confirmaria
      // a quem perguntou que o id acertou — que é a informação que um enumerador procura.
      return NextResponse.json(
        {
          error: "not_found",
          message: `Questão ${questionId} não existe nesta publicação.`,
        },
        { status: 404 },
      );
    }

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
    });
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
    const escopo = await resolveQuestionScope(id, questionId);
    if (escopo === null) {
      // 404 e não 403: distinguir "existe, mas não é desta publicação" de "não existe" confirmaria
      // a quem perguntou que o id acertou — que é a informação que um enumerador procura.
      return NextResponse.json(
        {
          error: "not_found",
          message: `Questão ${questionId} não existe nesta publicação.`,
        },
        { status: 404 },
      );
    }

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

    const nickname = body["nickname"];
    if (nickname !== undefined && nickname !== null && typeof nickname !== "string") {
      throw new BadRequestError("`nickname` precisa ser texto ou nulo.");
    }

    const result = await saveQuestion(new PrismaQuestionRepository(), {
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
        // Os metadados vão pelo mesmo `PATCH` e pela mesma versão. Um segundo caminho de escrita
        // teria o próprio `updatedAt` a comparar — duas versões da mesma questão brigando.
        ...normalizeMetadata(metadataFrom(body)),
      },
    });

    // Revalida **depois** de gravar, e só quando gravou: o autosave dispara por tempo, e
    // reavaliar a cada pausa da digitação seria custo por questão que não mudou. Falha aqui não
    // derruba o salvamento — o texto já está no banco, e um selo desatualizado é menos grave que
    // um 500 depois de gravar.
    if (result.written) await revalidate(questionId, result.snapshot.updatedAt);

    return NextResponse.json({
      id: result.snapshot.id,
      version: result.snapshot.updatedAt.toISOString(),
      // O cliente precisa saber se houve escrita: sem isto, o indicador de "salvo" piscaria a
      // cada autosave mesmo sem nada ter mudado, e viraria ruído que ninguém mais lê.
      written: result.written,
    });
  } catch (error) {
    if (error instanceof MetadataError) {
      // Recusa em vez de correção silenciosa: ano `20244` é erro de digitação, e gravar `2024`
      // seria adivinhação — que é como um acervo perde a confiabilidade.
      return NextResponse.json(
        { error: "invalid_metadata", field: error.field, message: error.message },
        { status: 400 },
      );
    }
    if (error instanceof QuestionNotFoundError) {
      return NextResponse.json({ error: "not_found", message: error.message }, { status: 404 });
    }
    if (error instanceof ConcurrencyConflictError) {
      return NextResponse.json(
        {
          error: "conflict",
          message:
            "Esta questão mudou desde que você abriu. Recarregue para ver a versão atual antes de salvar.",
          expectedVersion: String(error.expectedVersion),
          actualVersion: String(error.actualVersion),
        },
        { status: 409 },
      );
    }
    return toErrorResponse(error);
  }
}

/**
 * Recalcula o estado de validação da questão.
 *
 * Aqui e não dentro de `saveQuestion`: salvar é uma escrita com concorrência otimista, e pendurar
 * uma segunda escrita dentro dela faria uma falha de validação desfazer o salvamento — quer
 * dizer, perder o texto de quem estava digitando por causa de um selo.
 *
 * Silenciosa de propósito: o salvamento já respondeu que deu certo, e deu. Um selo desatualizado
 * é menos grave que um 500 depois de gravar.
 */
async function revalidate(questionId: string, keepVersion: Date): Promise<void> {
  try {
    const question = await questionForValidation(questionId);
    if (question === null) return;

    // `keepVersion` é a versão que este `PATCH` acabou de devolver ao cliente. Gravar o veredito
    // **sem movê-la** é o que impede o próprio salvamento de invalidar o cliente que ele acabou
    // de responder — ver #166, e o comentário longo no adaptador.
    await validateAndPersist(new PrismaValidationWriter(), questionId, question, keepVersion);
  } catch {
    return;
  }
}
