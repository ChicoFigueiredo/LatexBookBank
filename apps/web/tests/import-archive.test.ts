import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type {
  ImportArchivePorts,
  importArchive as ImportArchive,
} from "@modules/portability/application/import-archive";
import type { StorageProvider } from "@/shared/ports";

import { seedFullLibrary } from "./support/acervo-seed";
import { createTempDatabase } from "./support/temp-database";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * Importar um `.lbb` pelo caso de uso, contra um banco de verdade (#270).
 *
 * - A colisão é no escopo certo (ACV-11): a numeração do legado recomeça em cada biblioteca, e um
 *   `legacyId` igual numa biblioteca sem relação não é "o mesmo livro".
 * - A decisão é do servidor (SPA-10): com colisão, gravar exige o aceite explícito, e sem ele nada
 *   é gravado — não importa quem fez o POST.
 */

describe("importar um .lbb num acervo que já tem bibliotecas", () => {
  let archive: Uint8Array;
  let storage: StorageProvider;
  let ports: ImportArchivePorts;
  let importArchive: typeof ImportArchive;
  let libraries: () => Promise<readonly { readonly name: string }[]>;
  let dispose: () => Promise<void>;
  const otherQuestionIds = new Set<string>();

  beforeAll(async () => {
    // O arquivo vem de outra instalação: a biblioteca 42 do legado, com o livro 7 e as questões 101–103.
    const origin = await createTempDatabase();
    const seeded = await seedFullLibrary("lbb-origem");
    {
      const { readWorkspaceForExport } =
        await import("@modules/portability/infrastructure/prisma-workspace-source");
      const { toPortable } = await import("@modules/portability/application/export-workspace");
      const { writeArchive } = await import("@modules/portability/domain/portable-archive");
      const source = await readWorkspaceForExport(seeded.workspace.id, seeded.storage);
      archive = await writeArchive({
        workspace: toPortable(source!.workspace),
        assets: source!.assets,
        appVersion: "test",
        exportedAt: "2026-10-28T00:00:00Z",
      });
    }
    await origin.dispose();

    // O destino já tem a biblioteca 1 do legado, que **também** tem um livro 7 e questões 101–103 —
    // outra numeração, outro livro, nenhuma relação.
    const destination = await createTempDatabase();
    dispose = destination.dispose;
    vi.resetModules();
    const { prisma } = await import("@infrastructure/database/sqlite/client");
    const other = await prisma.workspace.create({
      data: { name: "Outra", slug: "outra", legacyId: 1 },
    });
    const book = await prisma.publication.create({
      data: { workspaceId: other.id, title: "Outro livro", legacyId: 7 },
    });
    for (const legacyId of [101, 102, 103]) {
      const question = await prisma.question.create({ data: { type: "DISCURSIVE", legacyId } });
      otherQuestionIds.add(question.id);
      await prisma.documentNode.create({
        data: {
          publicationId: book.id,
          kind: "QUESTION",
          sortKey: `a${legacyId}`,
          legacyId,
          questionId: question.id,
        },
      });
    }

    const { LocalFileStorageProvider } =
      await import("@infrastructure/storage/local/local-file-storage-provider");
    storage = new LocalFileStorageProvider({
      rootDir: mkdtempSync(path.join(tmpdir(), "lbb-test-storage-")),
    });
    const index = await import("@modules/portability/infrastructure/prisma-import-index");
    const { writeImportedWorkspace } =
      await import("@modules/portability/infrastructure/prisma-workspace-sink");
    ({ importArchive } = await import("@modules/portability/application/import-archive"));
    ports = {
      readIndex: index.readExistingIndex,
      describeConflicts: index.describeConflicts,
      write: (plan, assets) => writeImportedWorkspace(plan, assets, storage),
    };
    const { PrismaLibraryRepository } =
      await import("@modules/workspaces/infrastructure/prisma-library-repository");
    libraries = () => new PrismaLibraryRepository().list();
  });

  afterAll(async () => {
    await dispose?.();
  });

  it("o mesmo `legacyId` numa biblioteca sem relação não é conflito", async () => {
    const outcome = await importArchive(archive, { dryRun: true, acceptCollisions: false }, ports);

    expect(outcome.kind).toBe("simulated");
    expect(outcome.collisions).toEqual([]);
  });

  it("sem conflito, importa sem pedir aceite", async () => {
    const outcome = await importArchive(archive, { dryRun: false, acceptCollisions: false }, ports);

    expect(outcome.kind).toBe("imported");
    expect((await libraries()).map((library) => library.name).sort()).toEqual([
      "Fundamentos",
      "Outra",
    ]);
  });

  it("o mesmo arquivo de novo colide com a cópia — no livro e nas questões dele, e só ali", async () => {
    const outcome = await importArchive(archive, { dryRun: true, acceptCollisions: false }, ports);
    const keys = outcome.collisions.map(
      (collision) => `${collision.kind}:${collision.by}:${collision.value}`,
    );

    expect(keys.sort()).toEqual(
      [
        "workspace:legacyId:42",
        "publication:legacyId:7",
        "publication:legacyUuid:b3f1c0de-0000-4000-8000-000000000007",
        "publication:isbn:9788535700114",
        "question:legacyId:101",
        "question:legacyId:102",
        "question:legacyId:103",
      ].sort(),
    );
    // As questões colidem com as da cópia importada, nunca com as da biblioteca "Outra".
    const hit = outcome.collisions.filter((c) => c.kind === "question").map((c) => c.existingId);
    expect(hit.filter((id) => otherQuestionIds.has(id))).toEqual([]);
  });

  it("com conflito, gravar sem o aceite é recusado — e nada é gravado", async () => {
    const before = (await libraries()).length;
    const outcome = await importArchive(archive, { dryRun: false, acceptCollisions: false }, ports);

    expect(outcome.kind).toBe("needs-decision");
    expect(outcome.conflicts.length).toBeGreaterThan(0);
    expect((await libraries()).length).toBe(before);
  });

  it("com o aceite, grava a cópia ao lado — e a biblioteca de origem continua sendo a primeira", async () => {
    const before = (await libraries()).length;
    const outcome = await importArchive(archive, { dryRun: false, acceptCollisions: true }, ports);

    expect(outcome.kind).toBe("imported");
    expect((await libraries()).length).toBe(before + 1);

    // A segunda cópia entra sem o `legacyId` (é `@unique`): o dry-run seguinte ainda acha a primeira.
    const again = await importArchive(archive, { dryRun: true, acceptCollisions: false }, ports);
    expect(again.collisions.filter((collision) => collision.kind === "workspace")).toHaveLength(1);
  });
});
