/**
 * O formato `.lbb` — **próprio e versionado**, não o schema do Prisma.
 *
 * É a decisão central da fase, e o motivo é simples de enunciar: se o portable fosse o schema de
 * runtime, toda migration viraria uma mudança de formato de arquivo, e um `.lbb` de três meses
 * atrás deixaria de abrir sem ninguém ter decidido isso. Um formato de intercâmbio que acompanha
 * o banco não é um formato de intercâmbio — é um dump.
 *
 * Aqui o schema muda quando **o formato** muda, e aí ganha versão nova e um migrador. As duas
 * projeções — runtime → portable no export, portable → runtime no import — são o lugar onde a
 * diferença entre os dois mundos mora, e é de propósito que ela seja explícita e testável.
 *
 * Ver spec §7 · D18 · D37 · issue #115.
 */

/**
 * A versão do formato.
 *
 * Só uma existe hoje. A lista de conhecidas é o que permite recusar o futuro com mensagem em vez
 * de tentar ler um arquivo que não se entende — adivinhar aqui corromperia dado do usuário.
 */
export const PORTABLE_FORMAT_VERSION = 1;
export const KNOWN_FORMAT_VERSIONS = [1] as const;

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
  readonly metadataJson: string | null;
  readonly coverAsset: string | null;
  readonly nodes: readonly PortableNode[];
}

export interface PortableNode {
  readonly ref: string;
  readonly parentRef: string | null;
  readonly kind: string;
  readonly title: string | null;
  readonly sortKey: string;
  readonly numberingStyle: string;
  readonly originalLabel: string | null;
  readonly legacyId: number | null;
  readonly question: PortableQuestion | null;
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
  /** `sha256` dos assets da questão — **nunca** caminho. */
  readonly assets: readonly string[];
}

export interface PortableOption {
  readonly ref: string;
  readonly sortKey: string;
  readonly statementLatex: string;
  readonly solutionLatex: string;
  readonly isCorrect: boolean;
  readonly weight: number | null;
  readonly legacyId: number | null;
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
  if (
    typeof version !== "number" ||
    !(KNOWN_FORMAT_VERSIONS as readonly number[]).includes(version)
  ) {
    throw new UnknownFormatVersionError(version);
  }
}

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
