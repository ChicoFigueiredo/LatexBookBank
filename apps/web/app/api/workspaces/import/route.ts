import { NextResponse } from "next/server";

import { toRuntime } from "@modules/portability/application/import-workspace";
import { readArchive } from "@modules/portability/domain/portable-archive";
import {
  CorruptArchiveError,
  UnknownFormatVersionError,
} from "@modules/portability/domain/portable-schema";
import { deduplicarColisoes } from "@modules/portability/domain/import-conflicts";
import {
  describeConflicts,
  readExistingIndex,
} from "@modules/portability/infrastructure/prisma-import-index";
import { writeImportedWorkspace } from "@modules/portability/infrastructure/prisma-workspace-sink";
import { LocalFileStorageProvider } from "@infrastructure/storage/local/local-file-storage-provider";
import { env as appEnv } from "@/shared/config/env";

import { toErrorResponse } from "../../tree-http";

/**
 * Importa um `.lbb`.
 *
 * `dryRun=1` devolve o relatório sem gravar nada — é o que permite ver as colisões antes de
 * decidir. **Nada é sobrescrito**: colisão vira relatório, e o import cria um workspace novo.
 *
 * O `toRuntime` era chamado aqui **sem o índice do destino**, caindo no `EMPTY_INDEX`: a detecção
 * de colisão existia, era testada, e a simulação respondia zero conflitos em qualquer cenário. A
 * tela dizia isso com todas as letras, que é o pior tipo de defeito — o que soa como boa notícia.
 * `readExistingIndex` é a pergunta ao banco que faltava.
 *
 * Ver spec §7 · issue #117.
 */
export const dynamic = "force-dynamic";

/** Um acervo grande cabe em algumas centenas de MB; acima disso é engano, não uso. */
const MAX_BYTES = 512 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength === 0) {
      return NextResponse.json(
        { error: "bad_request", message: "O corpo precisa ser o arquivo `.lbb`." },
        { status: 400 },
      );
    }
    if (bytes.byteLength > MAX_BYTES) {
      return NextResponse.json(
        { error: "too_large", message: "O arquivo passa de 512 MB." },
        { status: 413 },
      );
    }

    const { manifest, workspace, assets } = await readArchive(bytes);
    const plan = toRuntime(workspace, await readExistingIndex());

    // Uma linha por item, não por chave: um livro que casa por `legacyId` **e** por `legacyUuid`
    // produz duas colisões, e "2 conflitos" para um livro só faz procurar o segundo que não há.
    const conflitos = await describeConflicts(deduplicarColisoes(plan.collisions), workspace);

    if (new URL(request.url).searchParams.get("dryRun") === "1") {
      return NextResponse.json({
        dryRun: true,
        manifest,
        conflicts: conflitos,
        collisions: plan.collisions,
        wouldCreate: manifest.counts,
        sizeBytes: bytes.byteLength,
      });
    }

    const storage = new LocalFileStorageProvider({ rootDir: appEnv().storageRoot });
    const report = await writeImportedWorkspace(plan, assets, storage);

    return NextResponse.json({
      dryRun: false,
      manifest,
      conflicts: conflitos,
      collisions: plan.collisions,
      report,
    });
  } catch (error) {
    if (error instanceof UnknownFormatVersionError) {
      return NextResponse.json(
        { error: "unknown_format_version", message: error.message },
        { status: 422 },
      );
    }
    if (error instanceof CorruptArchiveError) {
      return NextResponse.json(
        { error: "corrupt_archive", message: error.message },
        { status: 422 },
      );
    }
    return toErrorResponse(error);
  }
}
