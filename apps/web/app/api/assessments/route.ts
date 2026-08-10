import { NextResponse } from "next/server";

import {
  createAssessment,
  listAssessments,
} from "@modules/assessments/infrastructure/prisma-assessment-repository";

import { BadRequestError, readJson, toErrorResponse } from "../tree-http";

/**
 * As avaliações de um workspace.
 *
 * Por workspace, como tudo: são 13 bibliotecas, e uma prova de uma não deve aparecer na lista da
 * outra.
 *
 * Ver spec §20 · issue #143.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const workspaceId = new URL(request.url).searchParams.get("workspaceId");
    if (workspaceId === null || workspaceId.trim() === "") {
      throw new BadRequestError("`workspaceId` é obrigatório.");
    }

    return NextResponse.json({ assessments: await listAssessments(workspaceId) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson(request);

    const workspaceId = body["workspaceId"];
    if (typeof workspaceId !== "string" || workspaceId.trim() === "") {
      throw new BadRequestError("`workspaceId` é obrigatório.");
    }

    const title = body["title"];
    // Título é obrigatório porque é o que a lista mostra: uma prova "sem título" entre dez outras
    // obriga a abrir todas para achar a certa.
    if (typeof title !== "string" || title.trim() === "") {
      throw new BadRequestError("`title` é obrigatório.");
    }

    const created = await createAssessment({
      workspaceId,
      title: title.trim(),
      subtitle: asText(body["subtitle"]),
      notes: asText(body["notes"]),
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const asText = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;
