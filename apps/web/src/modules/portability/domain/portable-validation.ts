import { z } from "zod";

import {
  CorruptArchiveError,
  type PortableManifest,
  type PortableWorkspace,
} from "./portable-schema";

/**
 * O schema da v3, conferido na leitura (#270).
 *
 * O `data.json` entrava por cast: um arquivo com um título numérico ou uma lista faltando chegava
 * ao Prisma e virava um 500 opaco no meio da transação — sem dizer "arquivo corrompido", e sem
 * dizer onde. Aqui ele é recusado antes de qualquer gravação, com o caminho do campo.
 *
 * Os tipos (`PortableWorkspace`) continuam sendo a documentação do formato; o schema os espelha, e
 * `satisfies` amarra os dois — um campo novo no tipo sem par aqui não compila.
 */

const text = z.string();
const optionalText = z.string().nullable();
const integer = z.number().int();
const iso = z.iso.datetime({ offset: true });
const sha256 = z.string().regex(/^[0-9a-f]{64}$/, "não é um sha256");

const asset = z.object({
  sha256,
  kind: text,
  mimeType: text,
  originalFilename: optionalText,
  width: integer.nullable(),
  height: integer.nullable(),
  metadataJson: optionalText,
});

const anchor = z.object({
  asset: sha256,
  cropAsset: sha256.nullable(),
  pageNumber: integer,
  box: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }),
  rotation: z.number().nullable(),
  role: text,
  sourceText: optionalText,
  extractionMethod: optionalText,
  extractionModel: optionalText,
  metadataJson: optionalText,
});

const option = z.object({
  ref: text,
  sortKey: text,
  statementLatex: text,
  solutionLatex: text,
  originalLatex: optionalText,
  isCorrect: z.boolean(),
  weight: z.number().nullable(),
  legacyId: integer.nullable(),
  legacyMarcacao: optionalText,
});

const question = z.object({
  ref: text,
  type: text,
  nickname: optionalText,
  statementLatex: text,
  solutionLatex: text,
  complementLatex: text,
  originalLatex: optionalText,
  difficulty: integer,
  year: integer.nullable(),
  board: optionalText,
  institution: optionalText,
  role: optionalText,
  roleLevel: optionalText,
  publisher: optionalText,
  videoUrl: optionalText,
  status: text,
  validationStatus: text,
  legacyId: integer.nullable(),
  tags: z.array(text),
  options: z.array(option),
  assets: z.array(asset),
});

const node = z.object({
  ref: text,
  parentRef: optionalText,
  kind: text,
  title: optionalText,
  slug: optionalText,
  sortKey: text,
  numberingStyle: text,
  originalLabel: optionalText,
  legacyId: integer.nullable(),
  deletedAt: iso.nullable(),
  question: question.nullable(),
  bodyLatex: text,
  anchors: z.array(anchor),
});

const publication = z.object({
  ref: text,
  title: text,
  subtitle: optionalText,
  publisher: optionalText,
  legacyId: integer.nullable(),
  legacyUuid: optionalText,
  legacyUpdatedAt: iso.nullable(),
  metadataJson: optionalText,
  nickname: optionalText,
  isbn: optionalText,
  otherIdentifier: optionalText,
  edition: optionalText,
  editionYear: integer.nullable(),
  publicationDate: iso.nullable(),
  language: optionalText,
  series: optionalText,
  volume: optionalText,
  notes: optionalText,
  authors: z.array(text),
  captureProfileId: optionalText,
  assets: z.array(asset),
  coverAsset: sha256.nullable(),
  sourcePdfAsset: sha256.nullable(),
  nodes: z.array(node),
});

const assessment = z.object({
  title: text,
  subtitle: optionalText,
  notes: optionalText,
  sections: z.array(
    z.object({
      title: optionalText,
      sortKey: text,
      items: z.array(
        z.object({
          question: text,
          sortKey: text,
          points: z.number().nullable(),
          pinnedLastOptions: z.array(text),
        }),
      ),
    }),
  ),
  variants: z.array(
    z.object({
      label: text,
      seed: integer,
      shuffleQuestions: z.boolean(),
      shuffleOptions: z.boolean(),
      createdAt: iso,
      questions: z.array(
        z.object({
          question: text,
          position: integer,
          options: z.array(z.object({ option: text, displayedLabel: text, position: integer })),
        }),
      ),
    }),
  ),
});

const workspace = z.object({
  name: text,
  slug: text,
  description: optionalText,
  legacyId: integer.nullable(),
  legacySourcePath: optionalText,
  tags: z.array(z.object({ name: text, kind: text })),
  publications: z.array(publication),
  assessments: z.array(assessment),
  templates: z.array(
    z.object({ name: text, audience: text, preambleLatex: optionalText, optionsJson: text }),
  ),
  revisions: z.array(
    z.object({
      entityType: text,
      entity: text,
      revisionNumber: integer,
      origin: text,
      summary: text,
      snapshotJson: text,
      createdAt: iso,
    }),
  ),
}) satisfies z.ZodType<PortableWorkspace>;

const manifest = z.object({
  formatVersion: integer,
  appVersion: text,
  exportedAt: text,
  workspace: z.object({ name: text, slug: text }),
  counts: z.object({
    publications: integer,
    nodes: integer,
    questions: integer,
    options: integer,
    assets: integer,
  }),
  dataChecksum: text,
  assetChecksums: z.array(sha256),
}) satisfies z.ZodType<PortableManifest>;

/** Só a versão, antes de tudo: o resto do manifesto pode ter outra forma numa versão que não se lê. */
const versionOnly = z.object({ formatVersion: z.unknown() });

function parseJson(bytes: Uint8Array, what: string): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new CorruptArchiveError(`${what} não é JSON válido`);
  }
}

function check<T>(schema: z.ZodType<T>, raw: unknown, what: string): T {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;

  const issue = result.error.issues[0];
  const path = issue?.path.join(".") || "(raiz)";
  throw new CorruptArchiveError(
    `${what} não segue o formato: \`${path}\` — ${issue?.message ?? "inválido"}`,
  );
}

/** A versão declarada, lida sem exigir o resto do manifesto. */
export function readDeclaredVersion(bytes: Uint8Array): unknown {
  return check(versionOnly, parseJson(bytes, "o manifesto"), "o manifesto").formatVersion;
}

export function parseManifest(bytes: Uint8Array): PortableManifest {
  return check(manifest, parseJson(bytes, "o manifesto"), "o manifesto");
}

export function parsePortableWorkspace(bytes: Uint8Array): PortableWorkspace {
  return check(workspace, parseJson(bytes, "o `data.json`"), "o `data.json`");
}
