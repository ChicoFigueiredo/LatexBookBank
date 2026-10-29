import { NextResponse } from "next/server";

import { importArchive } from "@modules/portability/application/import-archive";
import { MAX_ARCHIVE_BYTES } from "@modules/portability/domain/portable-archive";
import {
  describeConflicts,
  readExistingIndex,
} from "@modules/portability/infrastructure/prisma-import-index";
import { writeImportedWorkspace } from "@modules/portability/infrastructure/prisma-workspace-sink";
import { storage } from "@infrastructure/composition";
import { readCappedBody } from "@/shared/http/read-capped-body";

import { BadRequestError, toErrorResponse } from "../../http";

/**
 * Importa um `.lbb`.
 *
 * `dryRun=1` devolve o relatório sem gravar nada — é o que permite ver as colisões antes de
 * decidir. **Nada é sobrescrito**: colisão vira relatório, e o import cria um workspace novo. Com
 * colisão, gravar exige `acceptCollisions=1`; sem ele a resposta é 409 com os conflitos (#270).
 *
 * O `toRuntime` era chamado aqui **sem o índice do destino**, caindo no `EMPTY_INDEX`: a detecção
 * de colisão existia, era testada, e a simulação respondia zero conflitos em qualquer cenário. A
 * tela dizia isso com todas as letras, que é o pior tipo de defeito — o que soa como boa notícia.
 * `readExistingIndex` é a pergunta ao banco que faltava.
 *
 * Ver spec §7 · issue #117 · #270.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    // Com teto **enquanto** lê: o `Content-Length` recusa antes do primeiro byte, e a contagem
    // pega o corpo que não o declara (#270). Ler tudo para depois comparar era aceitar 5 GB.
    // O teto é o do leitor e o da exportação (SEC-03): o `.lbb` que o app gera, o app aceita.
    const bytes = await readCappedBody(request, MAX_ARCHIVE_BYTES);
    if (bytes.byteLength === 0) throw new BadRequestError("O corpo precisa ser o arquivo `.lbb`.");

    const params = new URL(request.url).searchParams;
    const files = storage();
    const outcome = await importArchive(
      bytes,
      {
        dryRun: params.get("dryRun") === "1",
        acceptCollisions: params.get("acceptCollisions") === "1",
      },
      {
        readIndex: readExistingIndex,
        describeConflicts,
        write: (plan, assets) => writeImportedWorkspace(plan, assets, files),
      },
    );

    const seen = {
      manifest: outcome.manifest,
      conflicts: outcome.conflicts,
      collisions: outcome.collisions,
    };

    switch (outcome.kind) {
      case "simulated":
        return NextResponse.json({
          dryRun: true,
          ...seen,
          wouldCreate: outcome.manifest.counts,
          sizeBytes: bytes.byteLength,
        });
      case "needs-decision":
        // O servidor exige a decisão, e não só a tela: sem `acceptCollisions=1`, nada é gravado.
        return NextResponse.json(
          {
            error: "collisions_need_decision",
            message:
              "O arquivo colide com o que já está no acervo. Veja os conflitos e confirme para importar como cópia (acceptCollisions=1).",
            ...seen,
          },
          { status: 409 },
        );
      case "imported":
        return NextResponse.json({ dryRun: false, ...seen, report: outcome.report });
    }
  } catch (error) {
    return toErrorResponse(error);
  }
}
