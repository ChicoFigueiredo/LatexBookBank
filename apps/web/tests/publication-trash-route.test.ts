import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { jsonRequest, paramsOf, seedLibrary } from "./support/assessment-seed";
import { createTempDatabase } from "./support/temp-database";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * A lixeira do livro diz o que pode voltar — com a mesma regra que o restaurar aplica (STE-11).
 *
 * A rota recalculava `restorable` com um `if` de negócio copiado do `restoreNode`. Se a regra
 * mudasse num lado só, o botão da lixeira passaria a mentir: habilitado e o POST recusando, ou o
 * contrário. Este teste amarra os dois pela interface: o que a lista diz é o que o restaurar faz.
 */

let dispose: () => Promise<void>;

beforeAll(async () => {
  dispose = (await createTempDatabase()).dispose;
});

afterAll(async () => {
  await dispose();
});

async function livroComCapituloExcluido(slug: string) {
  const library = await seedLibrary(slug);
  const capitulo = await library.prisma.documentNode.create({
    data: {
      publicationId: library.publication.id,
      kind: "CHAPTER",
      title: "Cap. 1",
      sortKey: "a0",
    },
    select: { id: true },
  });
  const secao = await library.prisma.documentNode.create({
    data: {
      publicationId: library.publication.id,
      kind: "SECTION",
      title: "1.1",
      sortKey: "a0",
      parentId: capitulo.id,
    },
    select: { id: true },
  });

  const node = await import("../app/api/publications/[id]/nodes/[nodeId]/route");
  const removed = await node.DELETE(
    jsonRequest("DELETE"),
    paramsOf({ id: library.publication.id, nodeId: capitulo.id }),
  );
  expect(removed.status).toBe(200);

  return { library, capitulo, secao };
}

describe("a lixeira do livro", () => {
  it("o capítulo pode voltar; a seção dentro dele, sozinha, não", async () => {
    const { library, capitulo, secao } = await livroComCapituloExcluido("lixeira-livro");
    const trash = await import("../app/api/publications/[id]/trash/route");

    const response = await trash.GET(jsonRequest("GET"), paramsOf({ id: library.publication.id }));

    expect(response.status).toBe(200);
    const { items } = (await response.json()) as {
      items: { id: string; title: string; kind: string; deletedAt: string; restorable: boolean }[];
    };
    const porId = new Map(items.map((item) => [item.id, item]));

    expect(porId.get(capitulo.id)).toMatchObject({
      title: "Cap. 1",
      kind: "CHAPTER",
      restorable: true,
    });
    expect(porId.get(secao.id)).toMatchObject({ title: "1.1", restorable: false });
    expect(typeof porId.get(capitulo.id)?.deletedAt).toBe("string");
  });

  it("o que a lista diz é o que o restaurar faz", async () => {
    const { library, secao, capitulo } = await livroComCapituloExcluido("lixeira-coerente");
    const restore = await import("../app/api/publications/[id]/nodes/[nodeId]/restore/route");

    const recusa = await restore.POST(
      jsonRequest("POST"),
      paramsOf({ id: library.publication.id, nodeId: secao.id }),
    );
    expect(recusa.status).toBe(409);

    const aceito = await restore.POST(
      jsonRequest("POST"),
      paramsOf({ id: library.publication.id, nodeId: capitulo.id }),
    );
    expect(aceito.status).toBe(200);
  });
});
