import {
  assertAcceptable,
  extensionOf,
  sanitizeFilename,
} from "@modules/assets/domain/asset-ingestion";
import type { AssetKind } from "@modules/assets/domain/asset-kind";
import type { StorageProvider } from "@/shared/ports";

/**
 * Guarda um arquivo: valida, sobe para o `StorageProvider`, devolve o que o banco precisa.
 *
 * **A identidade é o `sha256` do conteúdo** (D29). O nome original é guardado só para leitura
 * humana — dois arquivos com o mesmo conteúdo e nomes diferentes são o mesmo asset, e o mesmo
 * nome com conteúdos diferentes são dois. Qualquer outra escolha faria "atualizar a figura"
 * silenciosamente reescrever o que outra questão referenciava.
 *
 * Daí também a imutabilidade: **arquivo alterado gera asset novo**. Não há caminho para
 * sobrescrever o conteúdo de um `storageKey`, porque a chave contém o hash — mudar o conteúdo
 * muda a chave.
 *
 * Ver spec §10 · D29 · issue #123.
 */

export interface StoreAssetInput {
  readonly workspaceId: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly content: Uint8Array;
  readonly kind: AssetKind;
}

export interface StoredAssetRecord {
  readonly storageKey: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly mimeType: string;
  readonly originalFilename: string;
  readonly kind: AssetKind;
  /** Dimensões, quando dá para lê-las do cabeçalho sem decodificar a imagem inteira. */
  readonly width: number | null;
  readonly height: number | null;
}

export async function storeAsset(
  input: StoreAssetInput,
  storage: StorageProvider,
): Promise<StoredAssetRecord> {
  assertAcceptable({
    filename: input.filename,
    mimeType: input.mimeType,
    sizeBytes: input.content.byteLength,
  });

  const stored = await storage.put({
    workspaceId: input.workspaceId,
    content: input.content,
    mimeType: input.mimeType,
    originalFilename: sanitizeFilename(input.filename),
  });

  const size = readDimensions(input.content, input.mimeType);

  return {
    storageKey: stored.storageKey,
    sha256: stored.sha256,
    sizeBytes: stored.sizeBytes,
    mimeType: input.mimeType,
    originalFilename: sanitizeFilename(input.filename),
    kind: input.kind,
    width: size?.width ?? null,
    height: size?.height ?? null,
  };
}

/**
 * Largura e altura, lidas do cabeçalho.
 *
 * Só PNG e JPEG, e só do cabeçalho: decodificar a imagem inteira para saber o tamanho custaria
 * memória proporcional ao arquivo, e o que se quer é um número para a tela dimensionar a figura.
 * Formato não reconhecido devolve `null` — e `null` é uma resposta, não uma falha.
 */
export function readDimensions(
  bytes: Uint8Array,
  mimeType: string,
): { width: number; height: number } | null {
  if (mimeType === "image/png") return readPngSize(bytes);
  if (mimeType === "image/jpeg") return readJpegSize(bytes);
  return null;
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

function readPngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.byteLength < 24) return null;
  if (PNG_MAGIC.some((byte, index) => bytes[index] !== byte)) return null;

  // O `IHDR` é sempre o primeiro chunk, e largura e altura são os primeiros oito bytes dele.
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function readJpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;

  // Percorre os segmentos até um `SOF`, que é onde o tamanho mora. Os outros são pulados pelo
  // próprio comprimento — ler JPEG sequencialmente é a única forma de achar isso.
  while (offset + 9 < bytes.byteLength) {
    if (bytes[offset] !== 0xff) return null;

    const marker = bytes[offset + 1] as number;
    const length = view.getUint16(offset + 2);

    // `SOF0`–`SOF3` e `SOF5`–`SOF15`, pulando `DHT` (0xc4), `JPG` (0xc8) e `DAC` (0xcc).
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
    }

    offset += 2 + length;
  }

  return null;
}

/**
 * O tipo de asset a partir do MIME, quando quem chama não declarou.
 *
 * Fonte de figura por extensão, porque `text/plain` cobre `.gnuplot`, `.pgf` e `.asy` — e perder
 * essa distinção transformaria um gerador de figura em anexo genérico, que é o que a Fase 11
 * evitou de propósito no import.
 */
export function inferKind(mimeType: string, filename: string): AssetKind {
  if (mimeType === "application/pdf") return "SOURCE_PDF";
  // `SOURCE_IMAGE` e não `QUESTION_IMAGE`: quem sobe um arquivo está trazendo uma fonte. Só o
  // uso dentro de uma questão decide o outro, e essa decisão é de quem insere, não de quem sobe.
  if (mimeType.startsWith("image/")) return "SOURCE_IMAGE";

  const extension = extensionOf(filename);
  const figure: Readonly<Record<string, AssetKind>> = {
    ".gnuplot": "FIGURE_SOURCE_GNUPLOT",
    ".pgf": "FIGURE_SOURCE_PGF",
    ".asy": "FIGURE_SOURCE_ASYMPTOTE",
    ".tex": "FIGURE_SOURCE_TEX",
  };

  return (extension !== null ? figure[extension] : undefined) ?? "ATTACHMENT";
}
