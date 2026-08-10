import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { inferKind, readDimensions, storeAsset } from "@modules/assets/application/store-asset";
import { UploadRejectedError } from "@modules/assets/domain/asset-ingestion";
import { LocalFileStorageProvider } from "@infrastructure/storage/local/local-file-storage-provider";
import { asStorageKey } from "@/shared/ports";

/**
 * **Nenhuma chave de storage escapa do prefixo do workspace.**
 *
 * A chave é `<workspaceId>/<sha[0:2]>/<sha><ext>`, e o `workspaceId` vem de quem chama. Um id com
 * `..` dentro escreveria fora da raiz — e o teste que prova que não escreve é o que transforma
 * "o provider valida" em "eu vi ele recusar".
 */

let root: string;
let storage: LocalFileStorageProvider;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "lbb-assets-"));
  storage = new LocalFileStorageProvider({ rootDir: root });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** Um PNG mínimo de 3×2, com o `IHDR` correto — é o cabeçalho que importa aqui. */
function png(width = 3, height = 2): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0, 0, 0, 13], 8);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);

  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

const upload = (over: Partial<Parameters<typeof storeAsset>[0]> = {}) =>
  storeAsset(
    {
      workspaceId: "ws-1",
      filename: "grafico.png",
      mimeType: "image/png",
      content: png(),
      kind: "SOURCE_IMAGE",
      ...over,
    },
    storage,
  );

describe("a chave nunca sai do workspace", () => {
  it("a chave começa pelo `workspaceId`", async () => {
    const record = await upload();
    expect(record.storageKey.startsWith("ws-1/")).toBe(true);
  });

  it("`..` no `workspaceId` é **recusado**, e nada é escrito fora da raiz", async () => {
    await expect(upload({ workspaceId: "../fora" })).rejects.toThrow();
    await expect(upload({ workspaceId: "ws/../../etc" })).rejects.toThrow();

    // O diretório acima da raiz continua sem nada nosso.
    await expect(readFile(join(root, "..", "fora"))).rejects.toThrow();
  });

  it("ler uma chave de outro workspace não vaza caminho", async () => {
    await upload();
    await expect(storage.get(asStorageKey("../fora/x.png"))).rejects.toThrow();
  });

  it("dois workspaces com o mesmo arquivo não se enxergam", async () => {
    // Mesmo conteúdo, mesma parte do hash — só o prefixo separa.
    const a = await upload({ workspaceId: "ws-a" });
    const b = await upload({ workspaceId: "ws-b" });

    expect(a.sha256).toBe(b.sha256);
    expect(a.storageKey).not.toBe(b.storageKey);
  });
});

describe("identidade é o conteúdo", () => {
  it("o mesmo conteúdo com nomes diferentes dá a mesma chave", async () => {
    // Dois arquivos com o mesmo conteúdo **são** o mesmo asset (D29).
    const a = await upload({ filename: "um.png" });
    const b = await upload({ filename: "outro.png" });

    expect(a.storageKey).toBe(b.storageKey);
    expect(a.sha256).toBe(b.sha256);
  });

  it("conteúdo diferente com o mesmo nome dá chaves diferentes", async () => {
    // É o que torna a fonte imutável: alterar o arquivo gera asset novo, nunca sobrescreve.
    const a = await upload({ content: png(3, 2) });
    const b = await upload({ content: png(9, 9) });

    expect(a.storageKey).not.toBe(b.storageKey);
  });

  it("o nome original é guardado limpo, só para leitura humana", async () => {
    const record = await upload({ filename: "C:\\Users\\chico\\Meu Gráfico.png" });
    expect(record.originalFilename).toBe("Meu Gráfico.png");
  });
});

describe("o que é recusado", () => {
  it("MIME fora da lista", async () => {
    await expect(
      upload({ filename: "x.exe", mimeType: "application/x-msdownload" }),
    ).rejects.toThrow(UploadRejectedError);
  });

  it("extensão que discorda do MIME", async () => {
    await expect(upload({ filename: "grafico.pdf" })).rejects.toThrow(/não combina/);
  });

  it("arquivo vazio", async () => {
    await expect(upload({ content: new Uint8Array(0) })).rejects.toThrow(/vazio/);
  });
});

describe("dimensões", () => {
  it("PNG tem largura e altura lidas do cabeçalho", async () => {
    const record = await upload({ content: png(1240, 1754) });

    expect(record.width).toBe(1240);
    expect(record.height).toBe(1754);
  });

  it("formato sem leitor devolve `null`, e `null` é resposta", async () => {
    // Não falha: a dimensão serve para a tela dimensionar a figura, não para validar o arquivo.
    expect(readDimensions(new Uint8Array([1, 2, 3]), "application/pdf")).toBeNull();
    expect(readDimensions(png(), "image/png")).toEqual({ width: 3, height: 2 });
  });

  it("PNG truncado não explode — devolve `null`", async () => {
    expect(readDimensions(png().slice(0, 10), "image/png")).toBeNull();
  });
});

describe("tipo inferido", () => {
  it("PDF é fonte, imagem é fonte de imagem", () => {
    expect(inferKind("application/pdf", "prova.pdf")).toBe("SOURCE_PDF");
    // `SOURCE_IMAGE` e não `QUESTION_IMAGE`: quem sobe traz uma fonte; o uso dentro da questão é
    // outra decisão, de outra pessoa, em outro momento.
    expect(inferKind("image/png", "foto.png")).toBe("SOURCE_IMAGE");
  });

  it("gerador de figura não vira anexo genérico", () => {
    // Perder isso transformaria um gerador em anexo — o que a Fase 11 evitou de propósito.
    expect(inferKind("text/plain", "grafico.gnuplot")).toBe("FIGURE_SOURCE_GNUPLOT");
    expect(inferKind("text/plain", "desenho.asy")).toBe("FIGURE_SOURCE_ASYMPTOTE");
    expect(inferKind("text/plain", "notas.txt")).toBe("ATTACHMENT");
  });
});
