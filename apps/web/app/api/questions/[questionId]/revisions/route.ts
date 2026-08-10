import { NextResponse } from "next/server";

import { parseSnapshot } from "@modules/questions/domain/revision-diff";
import { readQuestionState } from "@infrastructure/agent/prisma-question-state";
import { findRevision, listRevisions } from "@infrastructure/agent/prisma-revision-reader";

import { toErrorResponse } from "../../../tree-http";

/**
 * O histórico de uma questão.
 *
 * Sem `?revision=`, devolve a timeline — número, origem, resumo e data, sem os snapshots. A lista
 * inteira com snapshots seria megabytes para uma questão editada cem vezes, e a timeline só
 * precisa do que aparece na linha.
 *
 * Com `?revision=N`, devolve o snapshot daquela revisão **e o estado atual**, para o diff.
 *
 * Os dois juntos, e não só o snapshot: o editor guarda apenas os três campos de texto, e montar o
 * "atual" a partir dele mostraria alternativa, metadado e tag como inalterados sempre — bem os
 * campos onde o agente mais mexe. O servidor tem o agregado inteiro; mandar os dois lados prontos
 * é o que torna o diff honesto.
 *
 * Ver spec §37 · issue #109.
 */
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ questionId: string }> },
) {
  try {
    const { questionId } = await params;
    const wanted = new URL(request.url).searchParams.get("revision");

    if (wanted === null) {
      return NextResponse.json({ revisions: await listRevisions(questionId) });
    }

    const number = Number(wanted);
    if (!Number.isInteger(number)) {
      return NextResponse.json(
        { error: "bad_request", message: "`revision` precisa ser um inteiro." },
        { status: 400 },
      );
    }

    const revision = await findRevision(questionId, number);
    if (revision === null) {
      return NextResponse.json(
        { error: "revision_not_found", message: `A questão não tem a revisão ${number}.` },
        { status: 404 },
      );
    }

    return NextResponse.json({
      revisionNumber: revision.revisionNumber,
      origin: revision.origin,
      summary: revision.summary,
      createdAt: revision.createdAt,
      // Já desserializado: quem consome quer o estado, não a string. E `parseSnapshot` preenche
      // campo que uma revisão antiga não tinha, em vez de devolver `undefined` para a tela.
      snapshot: parseSnapshot(revision.snapshotJson),
      current: await readQuestionState(questionId),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
