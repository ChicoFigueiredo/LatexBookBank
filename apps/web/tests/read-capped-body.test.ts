import { describe, expect, it } from "vitest";

import { PayloadTooLargeError, readCappedBody } from "@/shared/http/read-capped-body";

/**
 * O corpo do import de `.lbb` era lido inteiro (`request.arrayBuffer()`) e só depois comparado com
 * o teto (SEC-03, #270): um POST de 5 GB ocupava 5 GB antes de ouvir "grande demais".
 */

/** Um corpo em pedaços que conta quantos foram puxados — para provar que a leitura parou cedo. */
function streamOf(chunks: number, chunkBytes: number) {
  let pulled = 0;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (pulled === chunks) {
          controller.close();
          return;
        }
        pulled += 1;
        controller.enqueue(new Uint8Array(chunkBytes).fill(7));
      },
    },
    // Sem pré-leitura: o stream só produz quando alguém lê.
    { highWaterMark: 0 },
  );
  return { body, pulled: () => pulled };
}

const post = (body: BodyInit | null, headers: Record<string, string> = {}) =>
  new Request("http://127.0.0.1/api/workspaces/import", {
    method: "POST",
    body,
    headers,
    // Corpo em stream exige `duplex` no fetch do Node.
    ...({ duplex: "half" } as object),
  });

describe("readCappedBody", () => {
  it("recusa pelo Content-Length, sem ler um byte do corpo", async () => {
    const stream = streamOf(10, 1024);

    await expect(
      readCappedBody(post(stream.body, { "content-length": "999999" }), 4096),
    ).rejects.toThrow(PayloadTooLargeError);
    expect(stream.pulled()).toBe(0);
  });

  it("sem Content-Length, conta enquanto lê e para no teto", async () => {
    const stream = streamOf(100, 1024);

    await expect(readCappedBody(post(stream.body), 4096)).rejects.toThrow(PayloadTooLargeError);
    expect(stream.pulled()).toBeLessThan(10);
  });

  it("o Content-Length que mente para menos não engana: o que conta é o que chega", async () => {
    const stream = streamOf(100, 1024);

    await expect(
      readCappedBody(post(stream.body, { "content-length": "10" }), 4096),
    ).rejects.toThrow(PayloadTooLargeError);
  });

  it("dentro do teto, devolve os bytes inteiros", async () => {
    const stream = streamOf(3, 1000);
    const bytes = await readCappedBody(post(stream.body), 4096);

    expect(bytes.byteLength).toBe(3000);
    expect(bytes.every((byte) => byte === 7)).toBe(true);
  });

  it("sem corpo, devolve vazio", async () => {
    expect((await readCappedBody(post(null), 4096)).byteLength).toBe(0);
  });
});
