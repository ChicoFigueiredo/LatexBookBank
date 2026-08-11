import { NextResponse } from "next/server";

import { renameLibrary } from "@modules/workspaces/application/manage-libraries";
import { PrismaLibraryRepository } from "@modules/workspaces/infrastructure/prisma-library-repository";

import { readJson } from "../../tree-http";
import { toLibraryErrorResponse } from "../library-http";

/** Renomear uma biblioteca. O slug não muda junto — ver `renameLibrary`. */
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ libraryId: string }> },
) {
  const { libraryId } = await params;

  try {
    const body = await readJson(request);
    const library = await renameLibrary(new PrismaLibraryRepository(), libraryId, body["name"]);

    return NextResponse.json({ library });
  } catch (error) {
    return toLibraryErrorResponse(error);
  }
}
