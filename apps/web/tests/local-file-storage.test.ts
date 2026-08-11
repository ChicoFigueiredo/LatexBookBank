import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LocalFileStorageProvider } from "@infrastructure/storage/local/local-file-storage-provider";
import { AssetNotFoundError, asStorageKey, StorageKeyEscapeError } from "@/shared/ports";

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

let rootDir: string;
let storage: LocalFileStorageProvider;

beforeEach(async () => {
  rootDir = await mkdtemp(path.join(tmpdir(), "lbb-storage-"));
  storage = new LocalFileStorageProvider({ rootDir });
});

afterEach(async () => {
  await rm(rootDir, { recursive: true, force: true });
});

describe("grava e lê", () => {
  it("devolve chave, hash e tamanho", async () => {
    const stored = await storage.put({
      workspaceId: "ws_1",
      content: bytes("conteúdo"),
      mimeType: "application/pdf",
    });

    expect(stored.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.sizeBytes).toBe(bytes("conteúdo").byteLength);
    expect(String(stored.storageKey)).toMatch(/^ws_1\/[0-9a-f]{2}\/[0-9a-f]{64}\.pdf$/);
  });

  it("lê de volta o mesmo conteúdo", async () => {
    const original = bytes("\\SI{1120}{\\real}");
    const stored = await storage.put({
      workspaceId: "ws_1",
      content: original,
      mimeType: "text/plain",
    });

    const read = await storage.get(stored.storageKey);
    expect(new TextDecoder().decode(read.content)).toBe("\\SI{1120}{\\real}");
    expect(read.mimeType).toBe("text/plain");
  });

  it("get de chave inexistente lança AssetNotFoundError", async () => {
    const key = asStorageKey(`ws_1/ab/${"a".repeat(64)}.pdf`);
    await expect(storage.get(key)).rejects.toBeInstanceOf(AssetNotFoundError);
  });
});

describe("endereçamento por hash", () => {
  it("o mesmo conteúdo produz a mesma chave — deduplicação natural", async () => {
    const first = await storage.put({
      workspaceId: "ws_1",
      content: bytes("igual"),
      mimeType: "text/plain",
    });
    const second = await storage.put({
      workspaceId: "ws_1",
      content: bytes("igual"),
      mimeType: "text/plain",
    });

    expect(second.storageKey).toBe(first.storageKey);
  });

  it("conteúdo diferente produz chave diferente — a fonte nunca é sobrescrita", async () => {
    // Imutabilidade (D29) por construção, não por disciplina.
    const first = await storage.put({
      workspaceId: "ws_1",
      content: bytes("versão 1"),
      mimeType: "text/plain",
    });
    const second = await storage.put({
      workspaceId: "ws_1",
      content: bytes("versão 2"),
      mimeType: "text/plain",
    });

    expect(second.storageKey).not.toBe(first.storageKey);
    // E a primeira continua lá, íntegra.
    const original = await storage.get(first.storageKey);
    expect(new TextDecoder().decode(original.content)).toBe("versão 1");
  });

  it("workspaces diferentes não compartilham chave, mesmo com conteúdo idêntico", async () => {
    const a = await storage.put({
      workspaceId: "ws_1",
      content: bytes("igual"),
      mimeType: "text/plain",
    });
    const b = await storage.put({
      workspaceId: "ws_2",
      content: bytes("igual"),
      mimeType: "text/plain",
    });

    expect(a.storageKey).not.toBe(b.storageKey);
    expect(a.sha256).toBe(b.sha256);
  });
});

describe("isolamento: nenhuma chave escapa do workspace", () => {
  const escapes = [
    ["sobe para fora da raiz", "../fora.pdf"],
    ["atravessa para outro workspace", "ws_1/../ws_2/segredo.pdf"],
    ["caminho absoluto", "/etc/passwd"],
    ["subida profunda", "ws_1/../../../../etc/passwd"],
  ] as const;

  for (const [label, attempted] of escapes) {
    it(`recusa chave que ${label}`, async () => {
      const key = asStorageKey(attempted);
      await expect(storage.get(key)).rejects.toBeInstanceOf(StorageKeyEscapeError);
      await expect(storage.exists(key)).rejects.toBeInstanceOf(StorageKeyEscapeError);
      await expect(storage.delete(key)).rejects.toBeInstanceOf(StorageKeyEscapeError);
    });
  }

  it("recusa workspaceId que contenha separador de caminho", async () => {
    await expect(
      storage.put({ workspaceId: "ws_1/../ws_2", content: bytes("x"), mimeType: "text/plain" }),
    ).rejects.toBeInstanceOf(StorageKeyEscapeError);
  });

  it("recusa workspaceId vazio", async () => {
    await expect(
      storage.put({ workspaceId: "", content: bytes("x"), mimeType: "text/plain" }),
    ).rejects.toBeInstanceOf(StorageKeyEscapeError);
  });

  it("nenhum arquivo é criado fora da raiz durante as tentativas", async () => {
    // Prova de que a recusa acontece antes de qualquer escrita.
    await expect(
      storage.put({ workspaceId: "..", content: bytes("x"), mimeType: "text/plain" }),
    ).rejects.toThrow();

    const parent = path.dirname(rootDir);
    await expect(readFile(path.join(parent, "x"))).rejects.toThrow();
  });
});

describe("validação de entrada", () => {
  it("recusa arquivo acima do limite", async () => {
    const small = new LocalFileStorageProvider({ rootDir, maxBytes: 8 });
    await expect(
      small.put({
        workspaceId: "ws_1",
        content: bytes("mais de oito bytes"),
        mimeType: "text/plain",
      }),
    ).rejects.toBeInstanceOf(RangeError);
  });

  it("recusa MIME fora da lista, quando há lista", async () => {
    const restricted = new LocalFileStorageProvider({
      rootDir,
      allowedMimeTypes: ["application/pdf"],
    });
    await expect(
      restricted.put({ workspaceId: "ws_1", content: bytes("x"), mimeType: "text/html" }),
    ).rejects.toBeInstanceOf(TypeError);
  });
});

describe("exists e delete", () => {
  it("exists reflete a realidade", async () => {
    const stored = await storage.put({
      workspaceId: "ws_1",
      content: bytes("x"),
      mimeType: "text/plain",
    });

    expect(await storage.exists(stored.storageKey)).toBe(true);
    await storage.delete(stored.storageKey);
    expect(await storage.exists(stored.storageKey)).toBe(false);
  });

  it("delete é idempotente", async () => {
    const key = asStorageKey(`ws_1/ab/${"b".repeat(64)}.pdf`);
    await expect(storage.delete(key)).resolves.toBeUndefined();
  });
});
