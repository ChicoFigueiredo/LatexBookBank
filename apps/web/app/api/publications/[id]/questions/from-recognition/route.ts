import { NextResponse } from "next/server";

import { PrismaDocumentTreeRepository } from "@modules/document-tree/infrastructure/prisma-document-tree-repository";
import { PrismaPublicationRepository } from "@modules/publications/infrastructure/prisma-publication-repository";
import { DestinationNotFoundError } from "@modules/questions/application/create-question";
import { InvalidQuestionTypeError } from "@modules/questions/domain/question-blueprint";
import { PrismaQuestionCreator } from "@modules/questions/infrastructure/prisma-question-creator";
import {
  RecognitionProvenanceError,
  createQuestionFromRecognition,
} from "@modules/recognition/application/create-question-from-recognition";
import {
  CandidateNotReviewedError,
  EmptyCandidateError,
  approveCandidate,
} from "@modules/recognition/domain/recognition-candidate";
import { PrismaRecognitionProvenance } from "@modules/recognition/infrastructure/prisma-recognition-provenance";

import { BadRequestError, parsePlacement, readJson, toErrorResponse } from "../../../../tree-http";

/**
 * "Aceitar e criar questão" — o fim do copia-e-cola entre telas.
 *
 * A aprovação acontece **aqui**, no servidor, e não é um campo que o cliente manda: `reviewed`
 * chega como gesto e `approveCandidate` é quem decide se o candidato pode virar questão. Um
 * cliente que esquecesse a revisão não conseguiria persistir mesmo assim.
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

    const candidate = approveCandidate({
      source: {
        anchorId: requireText(body["anchorId"], "anchorId"),
        cropAssetId: requireText(body["cropAssetId"], "cropAssetId"),
      },
      run: parseRun(body["run"]),
      reviewed: body["reviewed"] === true,
      originalLabel: typeof body["originalLabel"] === "string" ? body["originalLabel"] : null,
      statementLatex: requireText(body["statementLatex"], "statementLatex"),
      solutionLatex: typeof body["solutionLatex"] === "string" ? body["solutionLatex"] : "",
      options: parseOptions(body["options"]),
    });

    const created = await createQuestionFromRecognition(
      {
        reader: new PrismaDocumentTreeRepository(),
        creator: new PrismaQuestionCreator(),
        provenance: new PrismaRecognitionProvenance(),
      },
      {
        publicationId: id,
        placement: parsePlacement(body["placement"]),
        type: body["type"],
        candidate,
      },
    );

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof CandidateNotReviewedError) {
      return NextResponse.json(
        { error: "not_reviewed", message: error.message },
        { status: 422 },
      );
    }
    if (error instanceof EmptyCandidateError) {
      return NextResponse.json({ error: "empty_candidate", message: error.message }, { status: 422 });
    }
    if (error instanceof RecognitionProvenanceError) {
      return NextResponse.json({ error: "source_missing", message: error.message }, { status: 404 });
    }
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

function requireText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new BadRequestError(`O campo \`${field}\` é obrigatório.`);
  }
  return value;
}

/**
 * A execução do reconhecedor, como o cliente a recebeu.
 *
 * Vem do cliente porque foi ele quem recebeu a resposta do `/api/recognition` — o servidor não
 * guardou nada entre as duas chamadas. Nada aqui é confiado a ponto de virar decisão: são metadados
 * de auditoria, e o pior que um valor inventado faz é mentir sobre a própria origem. Os campos que
 * **decidem** — o LaTeX aprovado, o destino, o tipo — são conferidos.
 */
function parseRun(value: unknown): Parameters<typeof approveCandidate>[0]["run"] {
  const raw = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

  return {
    providerId: text(raw["providerId"], "desconhecido"),
    model: text(raw["model"], "desconhecido"),
    durationMs: Number.isFinite(Number(raw["durationMs"])) ? Number(raw["durationMs"]) : 0,
    confidence: typeof raw["confidence"] === "number" ? raw["confidence"] : null,
    mode: text(raw["mode"], "display"),
    rawLatex: text(raw["rawLatex"], ""),
    recognizedAt: new Date().toISOString(),
  };
}

const text = (value: unknown, fallback: string): string =>
  typeof value === "string" && value !== "" ? value.slice(0, 200_000) : fallback;

function parseOptions(value: unknown): readonly { statementLatex: string; isCorrect: boolean }[] {
  if (!Array.isArray(value)) return [];

  return value.slice(0, 26).map((entry) => {
    const raw = typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>) : {};
    return {
      statementLatex: typeof raw["statementLatex"] === "string" ? raw["statementLatex"] : "",
      isCorrect: raw["isCorrect"] === true,
    };
  });
}
