import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { useTempStorage } from "./support/asset-routes";
import { writeCalibreMetadata } from "./support/calibre-library";
import { installRouteFetch, type RouteEntry } from "./support/route-fetch";
import { fixtureBytes } from "./support/scan-fixtures";
import { createTempDatabase } from "./support/temp-database";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * O cliente do catálogo contra as rotas de verdade (tarefa I8 · ARQ-10 da revisão de 2026-09-23).
 *
 * A tela do Calibre redeclarava o livro do catálogo, o resultado da importação, o do lote e o do
 * anexo. Aqui o `catalogApi` faz a jornada inteira — abrir, importar, levar a duplicata, importar
 * em lote, anexar a um livro que já existe — contra os Route Handlers, um `metadata.db` de
 * Calibre de verdade (schema 27), um SQLite e um storage temporários.
 */

const ROUTES: readonly RouteEntry[] = [
  ["POST", "/api/catalog", () => import("../app/api/catalog/route")],
  ["POST", "/api/catalog/import", () => import("../app/api/catalog/import/route")],
  ["POST", "/api/catalog/import-batch", () => import("../app/api/catalog/import-batch/route")],
  ["POST", "/api/catalog/attach", () => import("../app/api/catalog/attach/route")],
];

let dispose: () => Promise<void>;
let restore: () => void = () => {};
let calibre = "";
const savedRoot = process.env["CALIBRE_LIBRARY_ROOT"];

/** Um livro do Calibre com o PDF no disco, onde o `data` diz que ele está. */
const livro = (id: number, title: string, isbn: string) => [
  `insert into books (id, title, path, uuid, has_cover) values (${id}, '${title}', 'Autor/${title} (${id})', 'uuid-${id}', 0)`,
  `insert into identifiers (book, type, val) values (${id}, 'isbn', '${isbn}')`,
  `insert into data (book, format, uncompressed_size, name) values (${id}, 'PDF', 1, 'livro')`,
];

beforeAll(async () => {
  dispose = (await createTempDatabase()).dispose;
  await useTempStorage();

  calibre = await mkdtemp(path.join(tmpdir(), "lbb-calibre-contrato-"));
  await writeCalibreMetadata(calibre, [
    ...livro(1, "Algebra", "9788535716801"),
    ...livro(2, "Geometria", "9788535716818"),
    ...livro(3, "Calculo", "9788535716825"),
  ]);
  for (const [id, title] of [
    [1, "Algebra"],
    [2, "Geometria"],
    [3, "Calculo"],
  ] as const) {
    const dir = path.join(calibre, "Autor", `${title} (${id})`);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "livro.pdf"), fixtureBytes("book-a.pdf"));
  }

  process.env["CALIBRE_LIBRARY_ROOT"] = calibre;
  (await import("@/shared/config/env")).resetEnvCache();
});

afterAll(async () => {
  if (savedRoot === undefined) delete process.env["CALIBRE_LIBRARY_ROOT"];
  else process.env["CALIBRE_LIBRARY_ROOT"] = savedRoot;
  (await import("@/shared/config/env")).resetEnvCache();
  await rm(calibre, { recursive: true, force: true });
  await dispose();
});

afterEach(() => restore());

describe("o cliente do catálogo fala a língua das rotas", () => {
  it("abre, importa, leva a duplicata, importa em lote e anexa", async () => {
    const { prisma } = await import("@infrastructure/database/sqlite/client");
    const workspace = await prisma.workspace.create({ data: { name: "calibre", slug: "calibre" } });
    restore = installRouteFetch(ROUTES).restore;
    const { catalogApi } = await import("@modules/publications/ui/catalog-client");

    const aberto = await catalogApi.browse({ path: calibre, libraryId: workspace.id, query: "" });
    expect(aberto.ok).toBe(true);
    expect(aberto.body.summary?.bookCount).toBe(3);
    expect(aberto.body.entries?.map((entry) => entry.title).sort()).toEqual([
      "Algebra",
      "Calculo",
      "Geometria",
    ]);
    const algebra = aberto.body.entries!.find((entry) => entry.title === "Algebra")!;
    expect(algebra.duplicate).toBeNull();
    expect(algebra.files.map((file) => file.format)).toEqual(["PDF"]);

    const importado = await catalogApi.importOne({
      path: calibre,
      libraryId: workspace.id,
      externalId: algebra.externalId,
      force: false,
    });
    expect(importado.status).toBe(201);
    expect(importado.body.href).toMatch(/^\/publications\//);
    expect(importado.body.warnings).toEqual(expect.any(Array));

    // De novo: a duplicata é 409 com o id do que já existe — a tela oferece abrir.
    const repetido = await catalogApi.importOne({
      path: calibre,
      libraryId: workspace.id,
      externalId: algebra.externalId,
      force: false,
    });
    expect(repetido.status).toBe(409);
    expect(repetido.body.publicationId).toEqual(expect.any(String));
    expect(repetido.body.message).toEqual(expect.any(String));

    const depois = await catalogApi.browse({ path: calibre, libraryId: workspace.id, query: "" });
    expect(
      depois.body.entries?.find((entry) => entry.title === "Algebra")?.duplicate,
    ).not.toBeNull();

    const outros = depois.body.entries!.filter((entry) => entry.title !== "Algebra");
    const lote = await catalogApi.importBatch({
      path: calibre,
      libraryId: workspace.id,
      externalIds: [...outros.map((entry) => entry.externalId), "nao-existe"],
    });
    expect(lote.status).toBe(201);
    expect(lote.body.results?.map((linha) => linha.outcome.kind)).toEqual([
      "imported",
      "imported",
      "failed",
    ]);
    const primeiro = lote.body.results?.[0]?.outcome;
    expect(primeiro?.kind === "imported" ? primeiro.result.href : null).toMatch(
      /^\/publications\//,
    );

    const destino = await prisma.publication.create({
      data: { workspaceId: workspace.id, title: "Livro sem fonte" },
    });
    const anexado = await catalogApi.attach({
      path: calibre,
      publicationId: destino.id,
      externalId: algebra.externalId,
      replace: false,
      fillMetadata: true,
    });
    expect(anexado.ok).toBe(true);
    expect(anexado.body.href).toBe(`/publications/${destino.id}`);
    expect(anexado.body.filename).toEqual(expect.any(String));
    expect(anexado.body.replaced).toBeNull();
    expect(anexado.body.filled?.map((campo) => campo.field)).toContain("isbn");

    // Anexar de novo ao mesmo livro: já tem fonte, e a troca é pergunta, não erro.
    const deNovo = await catalogApi.attach({
      path: calibre,
      publicationId: destino.id,
      externalId: algebra.externalId,
      replace: false,
      fillMetadata: false,
    });
    expect(deNovo.status).toBe(409);
    expect(deNovo.body.error).toBe("publication_has_source");
  });

  it("pasta fora da raiz configurada é recusada com a mensagem da rota", async () => {
    restore = installRouteFetch(ROUTES).restore;
    const { catalogApi } = await import("@modules/publications/ui/catalog-client");

    const recusado = await catalogApi.browse({ path: tmpdir(), libraryId: "", query: "" });

    expect(recusado.ok).toBe(false);
    expect(recusado.status).toBe(403);
    expect(recusado.body.message).toEqual(expect.any(String));
  });
});
