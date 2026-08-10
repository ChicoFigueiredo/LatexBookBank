import { toPortable } from "@modules/portability/application/export-workspace";
import { writeArchive } from "@modules/portability/domain/portable-archive";
import { readWorkspaceForExport } from "@modules/portability/infrastructure/prisma-workspace-source";
import { LocalFileStorageProvider } from "@infrastructure/storage/local/local-file-storage-provider";
import { env as appEnv } from "@/shared/config/env";
import { NextResponse } from "next/server";

import { toErrorResponse } from "../../tree-http";

/**
 * Exporta um workspace como `.lbb`.
 *
 * O arquivo desce direto, sem passar pelo storage: um `.lbb` é um artefato que o usuário leva
 * embora, não um dado do sistema. Guardá-lo no servidor criaria uma segunda cópia do acervo que
 * ninguém pediu — e que envelheceria em silêncio.
 *
 * Ver spec §7 · issue #117.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const workspaceId = new URL(request.url).searchParams.get("workspaceId");
    if (workspaceId === null) {
      return NextResponse.json(
        { error: "bad_request", message: "`workspaceId` é obrigatório." },
        { status: 400 },
      );
    }

    const storage = new LocalFileStorageProvider({ rootDir: appEnv().storageRoot });
    const source = await readWorkspaceForExport(workspaceId, storage);

    if (source === null) {
      return NextResponse.json(
        { error: "workspace_not_found", message: "Este workspace não existe." },
        { status: 404 },
      );
    }

    const archive = await writeArchive({
      workspace: toPortable(source.workspace),
      assets: source.assets,
      appVersion: process.env["npm_package_version"] ?? "0.0.0",
      exportedAt: new Date().toISOString(),
    });

    return new NextResponse(archive as unknown as BodyInit, {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${source.workspace.slug}.lbb"`,
        // Assets que o banco declara e o storage não tem viajam no cabeçalho: o download não pode
        // carregar um relatório dentro do zip sem mudar o formato, e o silêncio seria pior.
        ...(source.missingAssets.length > 0
          ? { "x-lbb-missing-assets": String(source.missingAssets.length) }
          : {}),
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
