import { NextResponse } from "next/server";

import { tagQuestionMany } from "@modules/questions/application/tag-question";
import { InvalidTagError, parseTagInput } from "@modules/questions/domain/tag";
import {
  PrismaTagRepository,
  workspaceOfQuestion,
} from "@modules/questions/infrastructure/prisma-tag-repository";

import { BadRequestError, readJson, toErrorResponse } from "../../../tree-http";

/**
 * As tags de uma questão.
 *
 * O `POST` aceita **uma lista**, porque colar "álgebra, funções, 2º grau" é o gesto real de quem
 * está organizando o acervo. A aplicação é sequencial (`tagQuestionMany`): duas grafias da mesma
 * tag numa mesma colagem criariam duas linhas se fossem resolvidas em paralelo.
 *
 * O `workspaceId` **não vem do cliente**. Ele é derivado da questão: a tag é por workspace, e
 * deixar o navegador escolher qual seria deixar o navegador criar tag na biblioteca dos outros.
 *
 * Ver spec §33 · issue #141.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ questionId: string }> },
) {
  const { questionId } = await params;

  try {
    const tags = await new PrismaTagRepository().listQuestionTags(questionId);
    return NextResponse.json({ tags });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ questionId: string }> },
) {
  const { questionId } = await params;

  try {
    const body = await readJson(request);
    const raw = body["names"];

    // Aceita a string colada **ou** a lista já quebrada: o campo da tela manda texto, e o agente
    // manda array. Uma rota que só aceitasse um dos dois obrigaria um dos dois a se adaptar.
    const names =
      typeof raw === "string"
        ? parseTagInput(raw)
        : Array.isArray(raw)
          ? parseTagInput(raw.filter((item) => typeof item === "string").join(","))
          : null;

    if (names === null) throw new BadRequestError("`names` precisa ser texto ou lista de textos.");
    if (names.length === 0) throw new BadRequestError("Nenhum nome de tag utilizável na entrada.");

    const workspaceId = await workspaceOfQuestion(questionId);
    if (workspaceId === null) {
      return NextResponse.json(
        { error: "not_found", message: "Esta questão não existe ou não está numa publicação." },
        { status: 404 },
      );
    }

    const repository = new PrismaTagRepository();
    await tagQuestionMany(repository, workspaceId, questionId, names);

    // Devolve a lista inteira, e não só as aplicadas: a tela precisa do estado final, e montá-lo
    // no cliente somando o que veio exigiria repetir a regra de deduplicação lá.
    return NextResponse.json(
      { tags: await repository.listQuestionTags(questionId) },
      {
        status: 201,
      },
    );
  } catch (error) {
    if (error instanceof InvalidTagError) {
      return NextResponse.json({ error: "invalid_tag", message: error.message }, { status: 400 });
    }
    return toErrorResponse(error);
  }
}
