/**
 * O corpo de uma requisição, lido com teto.
 *
 * `request.arrayBuffer()` lê tudo e só então deixa comparar com o limite: um upload de 5 GB ocupa
 * 5 GB antes de ouvir "grande demais" (SEC-03, #270). Aqui o `Content-Length` recusa antes de ler
 * qualquer byte, e a leitura conta o que chega — porque o cabeçalho pode faltar ou mentir.
 */

export class PayloadTooLargeError extends Error {
  constructor(readonly limitBytes: number) {
    super(`O corpo passa de ${Math.round(limitBytes / 1024 / 1024)} MB.`);
    this.name = "PayloadTooLargeError";
  }
}

export async function readCappedBody(request: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(request.headers.get("content-length") ?? Number.NaN);
  if (Number.isFinite(declared) && declared > maxBytes) throw new PayloadTooLargeError(maxBytes);

  if (request.body === null) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new PayloadTooLargeError(maxBytes);
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return bytes;
}
