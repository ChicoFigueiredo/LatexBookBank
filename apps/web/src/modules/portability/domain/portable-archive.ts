import { unzipSync, zipSync } from "fflate";

import {
  assertKnownVersion,
  assetPath,
  CorruptArchiveError,
  PORTABLE_FORMAT_VERSION,
  type PortableManifest,
  type PortableWorkspace,
} from "./portable-schema";

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

export async function writeArchive(input: WriteInput): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(JSON.stringify(input.workspace, null, 2));

  const files: Record<string, Uint8Array> = { [DATA]: dataBytes };

  // Deduplicação por hash: a mesma figura em cinco questões entra **uma** vez no zip.
  const seen = new Set<string>();
  for (const asset of input.assets) {
    if (seen.has(asset.sha256)) continue;
    seen.add(asset.sha256);
    files[assetPath(asset.sha256, asset.extension)] = asset.bytes;
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
  return zipSync(files, { level: 6 });
}

/**
 * Lê e **verifica** antes de devolver.
 *
 * A ordem importa: versão primeiro, checksum depois, dado por último. Um arquivo de versão futura
 * pode ter checksum válido e conteúdo que este código leria errado — verificar integridade antes
 * de versão responderia "está íntegro" sobre algo que não se sabe ler.
 */
export async function readArchive(bytes: Uint8Array): Promise<ReadOutput> {
  const files = unzipSync(bytes);
  const decoder = new TextDecoder();

  const manifestBytes = files[MANIFEST];
  if (!manifestBytes) {
    throw new CorruptArchiveError("o manifesto", "manifest.json", "ausente");
  }

  const manifest = JSON.parse(decoder.decode(manifestBytes)) as PortableManifest;
  assertKnownVersion(manifest.formatVersion);

  const dataBytes = files[DATA];
  if (!dataBytes) throw new CorruptArchiveError("os dados", "data.json", "ausente");

  const dataChecksum = await sha256Of(dataBytes);
  if (dataChecksum !== manifest.dataChecksum) {
    throw new CorruptArchiveError("o checksum dos dados", manifest.dataChecksum, dataChecksum);
  }

  const assets: ArchiveAsset[] = [];
  for (const [path, content] of Object.entries(files)) {
    if (!path.startsWith("assets/")) continue;

    const name = path.split("/").pop() as string;
    const dot = name.lastIndexOf(".");
    const sha256 = dot === -1 ? name : name.slice(0, dot);
    const extension = dot === -1 ? "" : name.slice(dot);

    // O nome do arquivo **é** a afirmação de qual é o conteúdo. Conferir é o que impede um zip
    // adulterado de entregar outra figura com o mesmo nome — e custa um hash por asset.
    const actual = await sha256Of(content);
    if (actual !== sha256) {
      throw new CorruptArchiveError(`o asset \`${name}\``, sha256, actual);
    }

    assets.push({ sha256, extension, bytes: content });
  }

  const missing = manifest.assetChecksums.filter(
    (sha) => !assets.some((asset) => asset.sha256 === sha),
  );
  if (missing.length > 0) {
    throw new CorruptArchiveError(
      `${missing.length} asset(s) que o manifesto declara`,
      missing[0] as string,
      "ausente",
    );
  }

  return {
    manifest,
    workspace: JSON.parse(decoder.decode(dataBytes)) as PortableWorkspace,
    assets,
  };
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
