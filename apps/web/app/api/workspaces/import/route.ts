import { NextResponse } from "next/server";

import { toRuntime } from "@modules/portability/application/import-workspace";
import { readArchive } from "@modules/portability/domain/portable-archive";
import {
  CorruptArchiveError,
  UnknownFormatVersionError,
} from "@modules/portability/domain/portable-schema";
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
    const plan = toRuntime(workspace);

    if (new URL(request.url).searchParams.get("dryRun") === "1") {
      return NextResponse.json({
        dryRun: true,
        manifest,
        collisions: plan.collisions,
        wouldCreate: manifest.counts,
      });
    }

    const storage = new LocalFileStorageProvider({ rootDir: appEnv().storageRoot });
    const report = await writeImportedWorkspace(plan, assets, storage);

    return NextResponse.json({ dryRun: false, manifest, collisions: plan.collisions, report });
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
