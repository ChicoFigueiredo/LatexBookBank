import "server-only";

import { createHash } from "node:crypto";

import { env as appEnv } from "@/shared/config/env";
import { LocalFileStorageProvider } from "@infrastructure/storage/local/local-file-storage-provider";
import { runScan } from "@modules/scan/application/run-scan";

import { InProcessScanRunner } from "./in-process-scan-runner";
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

  const runner = new InProcessScanRunner((runId) =>
    runScan(
      {
        store,
        storage,
        opener,
        sourceKey: storageKeyOfAsset,
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
    sources: new PrismaScanSources(),
    sha256: async (text: string) => createHash("sha256").update(text).digest("hex"),
  };
}
