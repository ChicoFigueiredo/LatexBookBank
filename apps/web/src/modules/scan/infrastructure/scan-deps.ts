import "server-only";

import { createHash } from "node:crypto";

import { env as appEnv } from "@/shared/config/env";
import { LocalFileStorageProvider } from "@infrastructure/storage/local/local-file-storage-provider";
import { runScan } from "@modules/scan/application/run-scan";

import { createFigurePass } from "@modules/scan/application/figure-pass";

import { InProcessScanRunner } from "./in-process-scan-runner";
import { PdfFigureCropper } from "./pdf-figure-cropper";
import { PrismaFigureAssets } from "./prisma-figure-assets";
import { PdfjsDocumentReader } from "./pdfjs-document-reader";
import { PrismaScanSources, PrismaScanStore, storageKeyOfAsset } from "./prisma-scan-store";
import { mathPassFromEnv, semanticPassFromEnv } from "./scan-passes";

/**
 * As peças do scan para as rotas. As rotas deste projeto montam os adaptadores na hora; aqui
 * fica só o que as rotas do scan repetiriam — e o laço, que precisa das mesmas peças fora da
 * requisição.
 */
export function scanDeps() {
  const env = appEnv();
  const store = new PrismaScanStore();
  const storage = new LocalFileStorageProvider({ rootDir: env.storageRoot });
  const opener = new PdfjsDocumentReader();

  // A mesma passada serve ao laço e ao "recortar de novo" da revisão: uma peça, dois usos.
  const figures = createFigurePass({
    assets: new PrismaFigureAssets(storage),
    cropper: ({ bytes, pdf }) =>
      new PdfFigureCropper({ bytes, render: (page, box, dpi) => pdf.renderRegion(page, box, dpi) }),
  });

  const runner = new InProcessScanRunner((runId) =>
    runScan(
      {
        store,
        storage,
        opener,
        sourceKey: storageKeyOfAsset,
        // As figuras são recortadas durante a varredura (D58): a revisão precisa vê-las.
        figures,
        semantic: semanticPassFromEnv(env),
        math: mathPassFromEnv(env),
      },
      runId,
    ),
  );

  return {
    store,
    storage,
    opener,
    runner,
    figures,
    sources: new PrismaScanSources(),
    sha256: async (text: string) => createHash("sha256").update(text).digest("hex"),
  };
}
