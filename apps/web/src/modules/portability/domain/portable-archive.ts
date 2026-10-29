import { Unzip, UnzipInflate, zipSync } from "fflate";

import {
  ARCHIVE_EXTENSIONS,
  ArchiveTooLargeError,
  ExportTooLargeError,
  assertKnownVersion,
  assetPath,
  CorruptArchiveError,
  PORTABLE_FORMAT_VERSION,
  type PortableManifest,
  type PortableWorkspace,
} from "./portable-schema";
import { parseManifest, parsePortableWorkspace, readDeclaredVersion } from "./portable-validation";
import { MAX_ARCHIVE_BYTES } from "./archive-size";

export { ArchiveTooLargeError, ExportTooLargeError } from "./portable-schema";
export { MAX_ARCHIVE_BYTES };

/**
 * O `.lbb`: um zip com manifesto, dados e assets endereçados por conteúdo.
 *
 * ```
 * biblioteca.lbb
 * ├─ manifest.json
 * ├─ data.json          # o Portable Schema, versionado
 * └─ assets/<ab>/<sha256>.<ext>
 * ```
 *
 * **Assets por `sha256`, nunca por caminho.** Isso dá três coisas de uma vez: deduplicação — a
 * mesma figura em cinco questões vira um arquivo —, verificação de integridade e independência de
 * path, que é o que permite ao importador religá-los a qualquer `StorageProvider`, local ou
 * bucket. Um arquivo que carregasse caminhos amarraria o import à árvore de diretórios de quem
 * exportou.
 *
 * O dado vai como JSON e não como SQLite. A spec §7 falava em `data.sqlite`, e um banco dentro do
 * zip traria o motor junto: para ler o arquivo seria preciso um SQLite compatível, e o formato
 * herdaria as versões dele. JSON versionado é legível, diffável e não tem motor — e o que a §7
 * queria garantir, que o portable não seja o schema de runtime, o `PortableSchema` já garante.
 *
 * Ver spec §7 · D18 · issue #115.
 */

const MANIFEST = "manifest.json";
const DATA = "data.json";

export interface ArchiveAsset {
  readonly sha256: string;
  readonly extension: string;
  readonly bytes: Uint8Array;
}

export interface WriteInput {
  readonly workspace: PortableWorkspace;
  readonly assets: readonly ArchiveAsset[];
  readonly appVersion: string;
  /** Injetável: o formato guarda a data, e um teste de round-trip precisa dela estável. */
  readonly exportedAt: string;
}

export interface ReadOutput {
  readonly manifest: PortableManifest;
  readonly workspace: PortableWorkspace;
  readonly assets: readonly ArchiveAsset[];
}

/** `sha256` em hexadecimal, do jeito que o manifesto guarda. */
export async function sha256Of(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Megabytes inteiros, para a mensagem que a pessoa lê. */
const megabytes = (bytes: number): string => `${Math.round(bytes / 1024 / 1024)} MB`;

/**
 * Escreve o `.lbb` — e recusa o que a leitura recusaria (SEC-03).
 *
 * Os tetos são os mesmos de `readArchive`, conferidos sobre o que vai para o zip (cada figura uma
 * vez), e o arquivo pronto tem de caber no corpo que a rota de import aceita.
 */
export async function writeArchive(
  input: WriteInput,
  limits: ArchiveLimits = DEFAULT_ARCHIVE_LIMITS,
): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(JSON.stringify(input.workspace, null, 2));
  if (dataBytes.byteLength > limits.maxDataBytes) {
    throw new ExportTooLargeError(`os dados passam de ${megabytes(limits.maxDataBytes)}`);
  }

  const files: Record<string, Uint8Array> = { [DATA]: dataBytes };

  // Deduplicação por hash: a mesma figura em cinco questões entra **uma** vez no zip.
  const seen = new Set<string>();
  let total = dataBytes.byteLength;
  for (const asset of input.assets) {
    if (seen.has(asset.sha256)) continue;
    seen.add(asset.sha256);
    if (asset.bytes.byteLength > limits.maxAssetBytes) {
      throw new ExportTooLargeError(`um arquivo passa de ${megabytes(limits.maxAssetBytes)}`);
    }
    total += asset.bytes.byteLength;
    if (total > limits.maxTotalBytes) {
      throw new ExportTooLargeError(`o conteúdo passa de ${megabytes(limits.maxTotalBytes)}`);
    }
    files[assetPath(asset.sha256, asset.extension)] = asset.bytes;
  }
  // Dados, manifesto e um arquivo por figura.
  if (seen.size + 2 > limits.maxEntries) {
    throw new ExportTooLargeError(`mais de ${limits.maxEntries} arquivos`);
  }

  const manifest: PortableManifest = {
    formatVersion: PORTABLE_FORMAT_VERSION,
    appVersion: input.appVersion,
    exportedAt: input.exportedAt,
    workspace: { name: input.workspace.name, slug: input.workspace.slug },
    counts: countOf(input.workspace, seen.size),
    dataChecksum: await sha256Of(dataBytes),
    assetChecksums: [...seen].sort(),
  };

  files[MANIFEST] = encoder.encode(JSON.stringify(manifest, null, 2));

  // `level: 6` e não 9: o ganho dos três últimos níveis é de poucos por cento num acervo cheio de
  // PNG e PDF, que já vêm comprimidos, e custa segundos de CPU em cima de um arquivo grande.
  const archive = zipSync(files, { level: 6 });
  // PDF e PNG já vêm comprimidos, e o zip pode sair um pouco maior que o conteúdo: o corpo do
  // import tem o mesmo teto, e é o arquivo pronto que tem de caber nele.
  if (archive.byteLength > limits.maxTotalBytes) {
    throw new ExportTooLargeError(`o arquivo passa de ${megabytes(limits.maxTotalBytes)}`);
  }
  return archive;
}

/**
 * Os tetos da leitura (#270).
 *
 * O `.lbb` vem de fora, e o zip declara o tamanho das próprias entradas — um arquivo de 1 MB pode
 * dizer que tem 10 bytes por entrada e descompactar 20 GB. Os tetos valem sobre o que **sai** do
 * descompactador, contado enquanto sai, e não sobre o que o cabeçalho afirma.
 *
 * O acervo real inteiro tem 109 MB; 64 MB por asset é o teto do próprio storage, e 1 GB no total é
 * folga de quase dez vezes. O `data.json` de uma biblioteca de mil questões tem poucos MB.
 *
 * A exportação confere os mesmos tetos (`writeArchive`): o `.lbb` que o app gera, o app lê.
 */
export interface ArchiveLimits {
  readonly maxEntries: number;
  readonly maxAssetBytes: number;
  readonly maxDataBytes: number;
  readonly maxTotalBytes: number;
}

export const DEFAULT_ARCHIVE_LIMITS: ArchiveLimits = {
  maxEntries: 100_000,
  maxAssetBytes: 64 * 1024 * 1024,
  maxDataBytes: 256 * 1024 * 1024,
  maxTotalBytes: MAX_ARCHIVE_BYTES,
};

/** `assets/<ab>/<sha256>.<ext>`, com o diretório igual ao começo do hash. */
const ASSET_ENTRY = /^assets\/([0-9a-f]{2})\/([0-9a-f]{64})(\.[a-z0-9]+)$/;

/**
 * O que a entrada pode ser: o manifesto, os dados, ou um asset com nome de hash e extensão da lista
 * fechada. Qualquer outra coisa — um script, um `../`, um nome inventado — é arquivo adulterado.
 */
function classify(
  name: string,
):
  | { readonly kind: "manifest" | "data" }
  | { readonly kind: "asset"; readonly sha256: string; readonly extension: string } {
  if (name === MANIFEST) return { kind: "manifest" };
  if (name === DATA) return { kind: "data" };

  const match = ASSET_ENTRY.exec(name);
  if (match && match[2]!.startsWith(match[1]!) && ARCHIVE_EXTENSIONS.has(match[3]!)) {
    return { kind: "asset", sha256: match[2]!, extension: match[3]! };
  }
  throw new CorruptArchiveError(`a entrada \`${name.slice(0, 120)}\` não pertence a um .lbb`);
}

/** O pedaço de zip entregue ao descompactador por vez: limita o maior bloco que sai de uma vez. */
const PUSH_BYTES = 16 * 1024;

/**
 * Descompacta contando, e para no primeiro teto.
 *
 * `unzipSync` alocava tudo antes de qualquer conferência. Aqui o zip entra em pedaços pequenos, e
 * cada pedaço descompactado é somado na hora: um deflate expande no máximo ~1000×, então 16 KB de
 * entrada nunca viram mais que ~16 MB de uma vez, e o teto corta antes de a memória ir embora.
 */
function unzipWithin(bytes: Uint8Array, limits: ArchiveLimits): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  let entries = 0;
  let total = 0;
  let failure: Error | null = null;

  const unzipper = new Unzip((file) => {
    if (failure) return;
    entries += 1;
    if (entries > limits.maxEntries) {
      failure = new ArchiveTooLargeError(`mais de ${limits.maxEntries} entradas`);
      return;
    }

    let entry: ReturnType<typeof classify>;
    try {
      entry = classify(file.name);
    } catch (error) {
      failure = error as Error;
      return;
    }
    if (files.has(file.name)) {
      failure = new CorruptArchiveError(`a entrada \`${file.name}\` aparece duas vezes`);
      return;
    }

    const cap =
      entry.kind === "asset"
        ? limits.maxAssetBytes
        : entry.kind === "data"
          ? limits.maxDataBytes
          : 1024 * 1024;
    // O tamanho declarado recusa cedo o caso honesto; o contado abaixo pega o que mente.
    if ((file.originalSize ?? 0) > cap) {
      failure = new ArchiveTooLargeError(`\`${file.name}\` passa de ${cap} bytes`);
      return;
    }

    const chunks: Uint8Array[] = [];
    let size = 0;
    file.ondata = (error, chunk, final) => {
      if (failure) return;
      if (error) {
        failure = new CorruptArchiveError(
          `a entrada \`${file.name}\` não descompacta (${error.message})`,
        );
        return;
      }
      size += chunk.length;
      total += chunk.length;
      if (size > cap) {
        failure = new ArchiveTooLargeError(`\`${file.name}\` passa de ${cap} bytes`);
        file.terminate();
        return;
      }
      if (total > limits.maxTotalBytes) {
        failure = new ArchiveTooLargeError(
          `o conteúdo descompactado passa de ${limits.maxTotalBytes} bytes`,
        );
        file.terminate();
        return;
      }
      chunks.push(chunk);
      if (final) files.set(file.name, concat(chunks, size));
    };
    file.start();
  });
  unzipper.register(UnzipInflate);

  try {
    for (let at = 0; at < bytes.length && !failure; at += PUSH_BYTES) {
      const end = Math.min(bytes.length, at + PUSH_BYTES);
      unzipper.push(bytes.subarray(at, end), end === bytes.length);
    }
  } catch (error) {
    failure ??= new CorruptArchiveError(`o zip não abre (${(error as Error).message})`);
  }
  if (failure) throw failure;

  return files;
}

function concat(chunks: readonly Uint8Array[], size: number): Uint8Array {
  if (chunks.length === 1) return chunks[0]!;
  const out = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/**
 * Lê e **verifica** antes de devolver.
 *
 * A ordem importa: tetos e nomes primeiro (enquanto descompacta), versão depois, checksum, e o
 * dado por último. Um arquivo de versão futura pode ter checksum válido e conteúdo que este código
 * leria errado — verificar integridade antes de versão responderia "está íntegro" sobre algo que
 * não se sabe ler. O manifesto e o `data.json` passam pelo schema da v3 (`portable-validation`).
 */
export async function readArchive(
  bytes: Uint8Array,
  limits: ArchiveLimits = DEFAULT_ARCHIVE_LIMITS,
): Promise<ReadOutput> {
  const files = unzipWithin(bytes, limits);

  const manifestBytes = files.get(MANIFEST);
  if (!manifestBytes) {
    throw new CorruptArchiveError("o manifesto", "manifest.json", "ausente");
  }

  assertKnownVersion(readDeclaredVersion(manifestBytes));
  const manifest = parseManifest(manifestBytes);

  const dataBytes = files.get(DATA);
  if (!dataBytes) throw new CorruptArchiveError("os dados", "data.json", "ausente");

  const dataChecksum = await sha256Of(dataBytes);
  if (dataChecksum !== manifest.dataChecksum) {
    throw new CorruptArchiveError("o checksum dos dados", manifest.dataChecksum, dataChecksum);
  }

  const assets: ArchiveAsset[] = [];
  for (const [path, content] of files) {
    const entry = classify(path);
    if (entry.kind !== "asset") continue;

    // O nome do arquivo **é** a afirmação de qual é o conteúdo. Conferir é o que impede um zip
    // adulterado de entregar outra figura com o mesmo nome — e custa um hash por asset.
    const actual = await sha256Of(content);
    if (actual !== entry.sha256) {
      throw new CorruptArchiveError(
        `o asset \`${entry.sha256}${entry.extension}\``,
        entry.sha256,
        actual,
      );
    }

    assets.push({ sha256: entry.sha256, extension: entry.extension, bytes: content });
  }

  const present = new Set(assets.map((asset) => asset.sha256));
  const missing = manifest.assetChecksums.filter((sha) => !present.has(sha));
  if (missing.length > 0) {
    throw new CorruptArchiveError(
      `${missing.length} asset(s) que o manifesto declara`,
      missing[0] as string,
      "ausente",
    );
  }

  return { manifest, workspace: parsePortableWorkspace(dataBytes), assets };
}

function countOf(workspace: PortableWorkspace, assets: number): PortableManifest["counts"] {
  let nodes = 0;
  let questions = 0;
  let options = 0;

  for (const publication of workspace.publications) {
    for (const node of publication.nodes) {
      nodes += 1;
      if (node.question === null) continue;

      questions += 1;
      options += node.question.options.length;
    }
  }

  return { publications: workspace.publications.length, nodes, questions, options, assets };
}
