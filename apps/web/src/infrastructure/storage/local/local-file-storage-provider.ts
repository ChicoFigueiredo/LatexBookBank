import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  AssetNotFoundError,
  asStorageKey,
  StorageKeyEscapeError,
  type PutAssetInput,
  type StorageKey,
  type StorageProvider,
  type StoredAsset,
  type StoredContent,
} from "@/shared/ports";

/**
 * `StorageProvider` sobre o filesystem — a implementação inicial e principal (D26).
 *
 * Conteúdo endereçado por hash: a chave é derivada do `sha256` do próprio conteúdo, no formato
 * `<workspaceId>/<sha[0:2]>/<sha><ext>`. Três consequências, todas desejáveis:
 *
 *   - **Deduplicação natural.** O mesmo arquivo gravado duas vezes ocupa um lugar só.
 *   - **Imutabilidade de graça** (D29). Conteúdo diferente produz chave diferente, então
 *     sobrescrever silenciosamente uma fonte é impossível por construção — não por disciplina.
 *   - **Integridade verificável.** A chave *é* o checksum.
 *
 * O fan-out de dois caracteres existe porque diretórios com dezenas de milhares de entradas
 * degradam em vários filesystems; é a mesma convenção que o git usa em `.git/objects`.
 */

export interface LocalFileStorageOptions {
  /** Raiz sob a qual tudo é gravado. Nada escapa daqui. */
  readonly rootDir: string;
  /** Limite por arquivo. O acervo real tem 109 MB no total, então 64 MB é folgado. */
  readonly maxBytes?: number;
  readonly allowedMimeTypes?: readonly string[];
}

const DEFAULT_MAX_BYTES = 64 * 1024 * 1024;

/** Extensão preservada só para inspeção humana do diretório; a identidade é o hash. */
const EXTENSION_BY_MIME: Readonly<Record<string, string>> = {
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/svg+xml": ".svg",
  "application/postscript": ".eps",
  "text/plain": ".txt",
  "application/x-tex": ".tex",
  "application/json": ".json",
};

export class LocalFileStorageProvider implements StorageProvider {
  readonly #rootDir: string;
  readonly #maxBytes: number;
  readonly #allowedMimeTypes: ReadonlySet<string> | null;

  constructor(options: LocalFileStorageOptions) {
    this.#rootDir = path.resolve(options.rootDir);
    this.#maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.#allowedMimeTypes = options.allowedMimeTypes ? new Set(options.allowedMimeTypes) : null;
  }

  async put(input: PutAssetInput): Promise<StoredAsset> {
    this.#assertWorkspaceId(input.workspaceId);
    this.#assertSize(input.content.byteLength, input.workspaceId);
    this.#assertMimeType(input.mimeType, input.workspaceId);

    const sha256 = createHash("sha256").update(input.content).digest("hex");
    const extension = EXTENSION_BY_MIME[input.mimeType] ?? "";
    const key = asStorageKey(`${input.workspaceId}/${sha256.slice(0, 2)}/${sha256}${extension}`);

    const absolute = this.#resolve(key);
    await mkdir(path.dirname(absolute), { recursive: true });

    // Endereçado por hash: se já existe, o conteúdo é bit a bit o mesmo. Regravar seria
    // desperdício, e — pior — abriria uma janela onde o arquivo fica truncado.
    if (!(await this.#exists(absolute))) {
      await writeFile(absolute, input.content);
    }

    return { storageKey: key, sha256, sizeBytes: input.content.byteLength };
  }

  async get(key: StorageKey): Promise<StoredContent> {
    const absolute = this.#resolve(key);

    try {
      const content = await readFile(absolute);
      return {
        content: new Uint8Array(content),
        mimeType: mimeTypeFromKey(key),
        sizeBytes: content.byteLength,
      };
    } catch {
      throw new AssetNotFoundError(key);
    }
  }

  async exists(key: StorageKey): Promise<boolean> {
    return this.#exists(this.#resolve(key));
  }

  async delete(key: StorageKey): Promise<void> {
    // `force` torna a remoção idempotente: apagar o que já não existe não é erro.
    await rm(this.#resolve(key), { force: true });
  }

  /**
   * Converte chave em caminho absoluto, recusando qualquer coisa que saia da raiz.
   *
   * Esta é a única porta de entrada para o filesystem nesta classe. Uma chave como
   * `../outro-workspace/segredo.pdf` normaliza para fora da raiz e é recusada — sem isso, o
   * prefixo de workspace seria decoração, não isolamento.
   */
  #resolve(key: StorageKey): string {
    const raw = String(key);
    const workspaceId = raw.split("/")[0] ?? "";
    const absolute = path.resolve(this.#rootDir, raw);
    const workspaceRoot = path.resolve(this.#rootDir, workspaceId);

    const escapesRoot =
      absolute !== this.#rootDir && !absolute.startsWith(this.#rootDir + path.sep);
    const escapesWorkspace =
      !workspaceId ||
      workspaceId === "." ||
      workspaceId === ".." ||
      !absolute.startsWith(workspaceRoot + path.sep);

    if (escapesRoot || escapesWorkspace) {
      throw new StorageKeyEscapeError(workspaceId, raw);
    }

    return absolute;
  }

  #assertWorkspaceId(workspaceId: string): void {
    // O workspaceId vira segmento de caminho; barra ou `..` aqui derrubaria o isolamento.
    if (!workspaceId || /[/\\]/.test(workspaceId) || workspaceId.includes("..")) {
      throw new StorageKeyEscapeError(workspaceId, workspaceId);
    }
  }

  #assertSize(sizeBytes: number, workspaceId: string): void {
    if (sizeBytes > this.#maxBytes) {
      throw new RangeError(
        `Arquivo de ${sizeBytes} bytes excede o limite de ${this.#maxBytes} ` +
          `(workspace ${workspaceId})`,
      );
    }
  }

  #assertMimeType(mimeType: string, workspaceId: string): void {
    if (this.#allowedMimeTypes && !this.#allowedMimeTypes.has(mimeType)) {
      throw new TypeError(`MIME type não permitido: ${mimeType} (workspace ${workspaceId})`);
    }
  }

  async #exists(absolute: string): Promise<boolean> {
    try {
      await stat(absolute);
      return true;
    } catch {
      return false;
    }
  }
}

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(EXTENSION_BY_MIME).map(([mime, extension]) => [extension, mime]),
);

const mimeTypeFromKey = (key: StorageKey): string => {
  const extension = path.extname(String(key));
  return MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
};
