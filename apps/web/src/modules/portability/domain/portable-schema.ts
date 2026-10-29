/**
 * O formato `.lbb` — **próprio e versionado**, não o schema do Prisma.
 *
 * É a decisão central da fase, e o motivo é simples de enunciar: se o portable fosse o schema de
 * runtime, toda migration viraria uma mudança de formato de arquivo, e um `.lbb` de três meses
 * atrás deixaria de abrir sem ninguém ter decidido isso. Um formato de intercâmbio que acompanha
 * o banco não é um formato de intercâmbio — é um dump.
 *
 * Aqui o schema muda quando **o formato** muda, e aí ganha versão nova. As duas projeções —
 * runtime → portable no export, portable → runtime no import — são o lugar onde a diferença entre
 * os dois mundos mora, e é de propósito que ela seja explícita e testável.
 *
 * Ver spec §7 · D18 · D37 · issue #115.
 */

/**
 * A versão do formato.
 *
 * **A v3 (#268, #269)** é a primeira que restaura de verdade. A v2 levava o corpo dos nós, as
 * âncoras e o PDF fonte, e perdia o resto no caminho: as figuras voltavam sem o nome que o LaTeX
 * cita (e toda questão com figura dava `File not found`), as figuras do scan e os recortes nem
 * viajavam, a capa sumia, e avaliações, variantes, revisões e templates ficavam de fora.
 *
 * **Só a v3 abre.** O projeto está no MVP e o backup vale daqui para frente (decisão do Chico,
 * 2026-10): um `.lbb` v1 ou v2 é recusado com mensagem, sem migrador. Um migrador teria de
 * inventar o que o arquivo antigo nunca teve — o nome das figuras, por exemplo —, e uma
 * restauração plausível e errada é pior que uma recusa clara.
 */
export const PORTABLE_FORMAT_VERSION = 3;
export const KNOWN_FORMAT_VERSIONS = [3] as const;
/** Versões que existiram e deixaram de abrir — a recusa delas diz o que fazer, não só "não sei". */
export const RETIRED_FORMAT_VERSIONS = [1, 2] as const;

export interface PortableManifest {
  readonly formatVersion: number;
  /** Versão do app que exportou. Informativa: o formato é quem manda. */
  readonly appVersion: string;
  readonly exportedAt: string;
  readonly workspace: { readonly name: string; readonly slug: string };
  readonly counts: {
    readonly publications: number;
    readonly nodes: number;
    readonly questions: number;
    readonly options: number;
    readonly assets: number;
  };
  /** `sha256` do `data.json`, para detectar arquivo corrompido antes de lê-lo. */
  readonly dataChecksum: string;
  /** Todos os `sha256` de asset presentes no zip. */
  readonly assetChecksums: readonly string[];
}

/* ───────────────────────────── o dado portável ───────────────────────────── */

export interface PortableWorkspace {
  readonly name: string;
  readonly slug: string;
  readonly publications: readonly PortablePublication[];
  readonly tags: readonly PortableTag[];
}

export interface PortableTag {
  readonly name: string;
  readonly kind: string;
}

/**
 * Um arquivo do acervo, descrito pelo que o banco sabe dele — e endereçado pelo `sha256`.
 *
 * **O nome original e o MIME atravessam** (v3). O LaTeX cita a figura por
 * `assetLatexName(originalFilename, sha256, mimeType)`: um asset que voltasse sem nome viraria
 * `figura-<hash>.png`, e o `\includegraphics{fig3-<hash>.png}` que o enunciado grava deixaria de
 * casar. O MIME, pelo mesmo motivo, decide a extensão do nome — e não pode ser adivinhado pela
 * extensão do arquivo no zip, que é só cosmética.
 */
export interface PortableAsset {
  readonly sha256: string;
  /** `AssetKind` — `QUESTION_IMAGE`, `CROP`, `COVER`… Nunca um derivado de render. */
  readonly kind: string;
  readonly mimeType: string;
  readonly originalFilename: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly metadataJson: string | null;
}

export interface PortablePublication {
  /**
   * Identidade **dentro do arquivo**, não do banco.
   *
   * Os uuids de runtime não atravessam: importar num workspace que já tem um deles seria colisão
   * artificial, e mantê-los amarraria o arquivo ao banco que o gerou. O que atravessa é `legacyId`
   * e `legacyUuid`, que são identidade de origem e a base da idempotência do import.
   */
  readonly ref: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly publisher: string | null;
  readonly legacyId: number | null;
  readonly legacyUuid: string | null;
  /** ISO 8601. */
  readonly legacyUpdatedAt: string | null;
  readonly metadataJson: string | null;

  /** A ficha catalográfica — o trabalho de quem cataloga, que o backup não pode perder. */
  readonly nickname: string | null;
  readonly isbn: string | null;
  readonly otherIdentifier: string | null;
  readonly edition: string | null;
  readonly editionYear: number | null;
  /** ISO 8601. */
  readonly publicationDate: string | null;
  readonly language: string | null;
  readonly series: string | null;
  readonly volume: string | null;
  readonly notes: string | null;
  /** Nomes, na ordem em que assinam. O `Author` é compartilhado e renasce por nome no destino. */
  readonly authors: readonly string[];
  /** O perfil de captura que o livro usa (D41). */
  readonly captureProfileId: string | null;

  /**
   * Os arquivos do livro (v3): a capa, os PDFs fonte, as figuras do scan, os recortes das âncoras.
   *
   * Os ponteiros abaixo — e os das âncoras — citam um `sha256` desta lista ou dos assets das
   * questões deste livro. Um hash citado e não descrito em nenhum dos dois é arquivo corrompido.
   */
  readonly assets: readonly PortableAsset[];
  /** O `sha256` da capa. */
  readonly coverAsset: string | null;
  /** O `sha256` do PDF fonte (D44). */
  readonly sourcePdfAsset: string | null;

  readonly nodes: readonly PortableNode[];
}

export interface PortableNode {
  readonly ref: string;
  readonly parentRef: string | null;
  readonly kind: string;
  readonly title: string | null;
  readonly slug: string | null;
  readonly sortKey: string;
  readonly numberingStyle: string;
  readonly originalLabel: string | null;
  readonly legacyId: number | null;
  /**
   * ISO 8601, ou `null` para o nó vivo. **A lixeira atravessa** (v3): excluir tira das telas, não
   * do acervo, e uma avaliação ou uma revisão podem citar a questão excluída.
   */
  readonly deletedAt: string | null;
  readonly question: PortableQuestion | null;
  /** O corpo do nó estrutural (ADR 0001). Vazio é "sem corpo". */
  readonly bodyLatex: string;
  /** As âncoras do nó, em ordem e com papel (D50). */
  readonly anchors: readonly PortableAnchor[];
}

/** Uma âncora de origem, com o PDF endereçado pelo hash — nunca por caminho. */
export interface PortableAnchor {
  readonly asset: string;
  /** O `sha256` do recorte guardado (a figura do scan, por exemplo), quando há um. */
  readonly cropAsset: string | null;
  readonly pageNumber: number;
  readonly box: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly rotation: number | null;
  readonly role: string;
  readonly sourceText: string | null;
  readonly extractionMethod: string | null;
  readonly extractionModel: string | null;
  readonly metadataJson: string | null;
}

export interface PortableQuestion {
  readonly ref: string;
  readonly type: string;
  readonly nickname: string | null;
  readonly statementLatex: string;
  readonly solutionLatex: string;
  readonly complementLatex: string;
  readonly originalLatex: string | null;
  readonly difficulty: number;
  readonly year: number | null;
  readonly board: string | null;
  readonly institution: string | null;
  readonly role: string | null;
  readonly roleLevel: string | null;
  readonly publisher: string | null;
  readonly videoUrl: string | null;
  readonly status: string;
  readonly validationStatus: string;
  readonly legacyId: number | null;
  readonly tags: readonly string[];
  readonly options: readonly PortableOption[];
  /** Os arquivos da questão, descritos — o `sha256` é o endereço, **nunca** caminho. */
  readonly assets: readonly PortableAsset[];
}

export interface PortableOption {
  readonly ref: string;
  readonly sortKey: string;
  readonly statementLatex: string;
  readonly solutionLatex: string;
  readonly originalLatex: string | null;
  readonly isCorrect: boolean;
  readonly weight: number | null;
  readonly legacyId: number | null;
  /** A letra `a`–`e` do legado, só para auditoria do import (issue #111). */
  readonly legacyMarcacao: string | null;
}

/* ─────────────────────────────── versionamento ─────────────────────────────── */

export class UnknownFormatVersionError extends Error {
  constructor(readonly found: unknown) {
    super(
      `Este arquivo declara \`formatVersion\` ${JSON.stringify(found)}, que esta versão do ` +
        `LatexBookBank não conhece (conhecidas: ${KNOWN_FORMAT_VERSIONS.join(", ")}). ` +
        "Atualize o aplicativo — o arquivo não é aberto por tentativa.",
    );
    this.name = "UnknownFormatVersionError";
  }
}

/**
 * Um `.lbb` de uma versão que existiu e não abre mais.
 *
 * Separado do "não conheço" porque o conselho é o oposto: lá, atualizar o app; aqui, exportar de
 * novo com o app de hoje. Uma mensagem que mandasse atualizar um app que já está atualizado
 * deixaria a pessoa sem saída.
 */
export class RetiredFormatVersionError extends Error {
  constructor(readonly found: number) {
    super(
      `Este arquivo é um .lbb v${found}, de antes de o backup levar figuras, capas, avaliações e ` +
        `revisões. Esta versão do LatexBookBank só abre .lbb v${PORTABLE_FORMAT_VERSION}: exporte ` +
        "a biblioteca de novo pelo app atualizado e importe o arquivo novo.",
    );
    this.name = "RetiredFormatVersionError";
  }
}

export class CorruptArchiveError extends Error {
  constructor(what: string, expected: string, actual: string) {
    super(
      `O arquivo está corrompido: ${what} não confere. ` +
        `Esperado \`${expected.slice(0, 12)}…\`, encontrado \`${actual.slice(0, 12)}…\`.`,
    );
    this.name = "CorruptArchiveError";
  }
}

/**
 * Aceita a versão, ou recusa.
 *
 * **Nunca adivinha.** Um arquivo de versão futura pode ter campo que este código leria errado, e
 * ler errado é pior que não ler: o usuário ficaria com um workspace parcialmente importado,
 * plausível o bastante para ninguém desconfiar.
 */
export function assertKnownVersion(version: unknown): asserts version is number {
  if ((RETIRED_FORMAT_VERSIONS as readonly unknown[]).includes(version)) {
    throw new RetiredFormatVersionError(version as number);
  }
  if (
    typeof version !== "number" ||
    !(KNOWN_FORMAT_VERSIONS as readonly number[]).includes(version)
  ) {
    throw new UnknownFormatVersionError(version);
  }
}

/**
 * A extensão do arquivo dentro do zip, pelo MIME.
 *
 * Cosmética — o endereço é o hash e o MIME viaja no dado —, mas é ela que deixa o zip navegável à
 * mão. MIME fora da tabela vira `.bin`: a extensão é uma lista fechada, e o import recusa nome de
 * arquivo que não esteja nela.
 */
const ARCHIVE_EXTENSION_BY_MIME: Readonly<Record<string, string>> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
  "application/pdf": ".pdf",
  "application/postscript": ".eps",
  "application/x-tex": ".tex",
  "application/json": ".json",
  "text/plain": ".txt",
};

export const archiveExtensionFor = (mimeType: string): string =>
  ARCHIVE_EXTENSION_BY_MIME[mimeType] ?? ".bin";

/** As extensões que um `.lbb` pode ter em `assets/` — todas as que `archiveExtensionFor` produz. */
export const ARCHIVE_EXTENSIONS: ReadonlySet<string> = new Set([
  ...Object.values(ARCHIVE_EXTENSION_BY_MIME),
  ".bin",
]);

/**
 * Onde um asset mora dentro do zip.
 *
 * Os dois primeiros caracteres do hash viram diretório: um workspace com dez mil assets num só
 * diretório é lento de listar em qualquer sistema de arquivos, e o zip é extraído em algum.
 */
export function assetPath(sha256: string, extension: string): string {
  const clean = extension.startsWith(".") ? extension : extension ? `.${extension}` : "";
  return `assets/${sha256.slice(0, 2)}/${sha256}${clean}`;
}
