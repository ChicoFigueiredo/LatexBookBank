import { NextResponse } from "next/server";

import { PrismaDocumentTreeRepository } from "@modules/document-tree/infrastructure/prisma-document-tree-repository";
import { PrismaPublicationRepository } from "@modules/publications/infrastructure/prisma-publication-repository";
import {
  DestinationNotFoundError,
  createQuestion,
} from "@modules/questions/application/create-question";
import { InvalidQuestionTypeError } from "@modules/questions/domain/question-blueprint";
import { PrismaQuestionCreator } from "@modules/questions/infrastructure/prisma-question-creator";

import { parsePlacement, parseTitle, readJson, toErrorResponse } from "../../../tree-http";

/**
 * Cria uma questão — **e o nó dela** — em uma operação.
 *
 * Endpoint atômico para operação de negócio atômica (§70): a alternativa seria a UI chamar
 * `POST /nodes` e depois um segundo endpoint para o conteúdo, e é exatamente essa sequência que
 * deixava nó órfão quando a segunda chamada falhava.
 *
 * A resposta traz `questionId` **e** `nodeId` porque quem chama precisa dos dois para navegar:
 * selecionar na árvore é por nó, abrir o editor é por questão (§73).
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const publication = await new PrismaPublicationRepository().findById(id);
  if (!publication) {
    return NextResponse.json(
      { error: "publication_not_found", message: `Publicação ${id} não existe.` },
      { status: 404 },
    );
  }

  try {
    const body = await readJson(request);

    const created = await createQuestion(
      { reader: new PrismaDocumentTreeRepository(), creator: new PrismaQuestionCreator() },
      {
        publicationId: id,
        type: body["type"],
        placement: parsePlacement(body["placement"]),
        title: parseTitle(body["title"]),
        originalLabel: parseTitle(body["originalLabel"]),
        difficulty: body["difficulty"],
        optionCount: body["optionCount"],
      },
    );

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidQuestionTypeError) {
      return NextResponse.json(
        { error: "invalid_question_type", message: error.message },
        { status: 400 },
      );
    }
    if (error instanceof DestinationNotFoundError) {
      return NextResponse.json(
        { error: "destination_not_found", message: error.message },
        { status: 404 },
      );
    }
    return toErrorResponse(error);
  }
}
