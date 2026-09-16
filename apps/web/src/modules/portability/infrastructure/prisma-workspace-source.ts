import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";
import type { RuntimeWorkspace } from "@modules/portability/application/export-workspace";
import type { StorageProvider } from "@/shared/ports";
import { asStorageKey } from "@/shared/ports";

/**
 * Lê um workspace inteiro do banco, e busca os assets no `StorageProvider`.
 *
 * A leitura é uma consulta só, com tudo aninhado: um workspace tem centenas de nós, e uma
 * consulta por nó transformaria a exportação numa espera. O Prisma resolve o aninhamento em
 * poucas consultas, e é a diferença entre exportar em um segundo e exportar em um minuto.
 *
 * Artefatos de render **não** são exportados. Eles são cache — regeneráveis a partir do LaTeX — e
 * carregá-los faria o `.lbb` de um acervo pequeno pesar centenas de megabytes de PDF que o
 * destino recompila em segundos.
 *
 * Ver spec §7 · issue #117.
 */

/** O que não atravessa: derivado de compilação, reconstruível no destino. */
const DERIVED_KINDS = new Set(["RENDER_PDF", "RENDER_PNG", "RENDER_SVG"]);

export interface WorkspaceExport {
  readonly workspace: RuntimeWorkspace;
  readonly assets: readonly {
    readonly sha256: string;
    readonly extension: string;
    readonly bytes: Uint8Array;
  }[];
  /** Assets que o banco declara e o storage não tem — o relatório precisa dizer. */
  readonly missingAssets: readonly string[];
}

export async function readWorkspaceForExport(
  workspaceId: string,
  storage: StorageProvider,
): Promise<WorkspaceExport | null> {
  const row = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      name: true,
      slug: true,
      tags: { select: { name: true, kind: true } },
      publications: {
        select: {
          id: true,
          title: true,
          subtitle: true,
          publisher: true,
          nickname: true,
          isbn: true,
          otherIdentifier: true,
          edition: true,
          editionYear: true,
          language: true,
          series: true,
          volume: true,
          notes: true,
          authors: { orderBy: { position: "asc" }, select: { author: { select: { name: true } } } },
          legacyId: true,
          legacyUuid: true,
          metadataJson: true,
          sourcePdfAssetId: true,
          nodes: {
            where: { deletedAt: null },
            orderBy: { sortKey: "asc" },
            select: {
              id: true,
              parentId: true,
              kind: true,
              title: true,
              sortKey: true,
              numberingStyle: true,
              originalLabel: true,
              legacyId: true,
              bodyLatex: true,
              anchors: {
                orderBy: { sortOrder: "asc" },
                select: {
                  role: true,
                  sourceAnchor: {
                    select: {
                      pageNumber: true,
                      xNormalized: true,
                      yNormalized: true,
                      widthNormalized: true,
                      heightNormalized: true,
                      sourceText: true,
                      extractionMethod: true,
                      extractionModel: true,
                      sourceAsset: { select: { sha256: true, storageKey: true, mimeType: true } },
                    },
                  },
                },
              },
              question: {
                select: {
                  id: true,
                  type: true,
                  nickname: true,
                  statementLatex: true,
                  solutionLatex: true,
                  complementLatex: true,
                  originalLatex: true,
                  difficulty: true,
                  year: true,
                  board: true,
                  institution: true,
                  role: true,
                  roleLevel: true,
                  publisher: true,
                  videoUrl: true,
                  status: true,
                  validationStatus: true,
                  legacyId: true,
                  tags: { select: { tag: { select: { name: true } } } },
                  options: {
                    orderBy: { sortKey: "asc" },
                    select: {
                      id: true,
                      sortKey: true,
                      statementLatex: true,
                      solutionLatex: true,
                      originalLatex: true,
                      isCorrect: true,
                      weight: true,
                      legacyId: true,
                      legacyMarcacao: true,
                    },
                  },
                  assets: {
                    select: { sha256: true, storageKey: true, kind: true, mimeType: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!row) return null;

  const wanted = new Map<string, { storageKey: string; mimeType: string }>();

  // O PDF fonte de cada livro viaja no arquivo (v2): as âncoras apontam para ele, e uma âncora sem
  // o PDF seria uma coordenada sobre nada.
  const sourceIds = row.publications.map((p) => p.sourcePdfAssetId).filter((id): id is string => id !== null);
  const sources = new Map(
    (
      await prisma.asset.findMany({
        where: { id: { in: sourceIds } },
        select: { id: true, sha256: true, storageKey: true, mimeType: true },
      })
    ).map((asset) => [asset.id, asset]),
  );
  const want = (asset: { sha256: string; storageKey: string; mimeType: string }) => {
    wanted.set(asset.sha256, { storageKey: asset.storageKey, mimeType: asset.mimeType });
    return asset.sha256;
  };

  const workspace: RuntimeWorkspace = {
    name: row.name,
    slug: row.slug,
    tags: row.tags,
    publications: row.publications.map((publication) => ({
      id: publication.id,
      title: publication.title,
      subtitle: publication.subtitle,
      publisher: publication.publisher,
      nickname: publication.nickname,
      isbn: publication.isbn,
      otherIdentifier: publication.otherIdentifier,
      edition: publication.edition,
      editionYear: publication.editionYear,
      language: publication.language,
      series: publication.series,
      volume: publication.volume,
      notes: publication.notes,
      authors: publication.authors.map((entry) => entry.author.name),
      legacyId: publication.legacyId,
      legacyUuid: publication.legacyUuid,
      metadataJson: publication.metadataJson,
      coverAssetSha256: null,
      sourcePdfAssetSha256: (() => {
        const source = publication.sourcePdfAssetId ? sources.get(publication.sourcePdfAssetId) : undefined;
        return source ? want(source) : null;
      })(),
      nodes: publication.nodes.map((node) => ({
        id: node.id,
        parentId: node.parentId,
        kind: node.kind,
        title: node.title,
        sortKey: node.sortKey,
        numberingStyle: node.numberingStyle,
        originalLabel: node.originalLabel,
        legacyId: node.legacyId,
        bodyLatex: node.bodyLatex,
        anchors: node.anchors.map(({ role, sourceAnchor: anchor }) => ({
          sha256: want(anchor.sourceAsset),
          pageNumber: anchor.pageNumber,
          box: {
            x: anchor.xNormalized,
            y: anchor.yNormalized,
            width: anchor.widthNormalized,
            height: anchor.heightNormalized,
          },
          role,
          sourceText: anchor.sourceText,
          extractionMethod: anchor.extractionMethod,
          extractionModel: anchor.extractionModel,
        })),
        question:
          node.question === null
            ? null
            : {
                ...node.question,
                tags: node.question.tags.map((link) => link.tag.name),
                assetSha256: node.question.assets
                  .filter((asset) => !DERIVED_KINDS.has(asset.kind))
                  .map((asset) => {
                    wanted.set(asset.sha256, {
                      storageKey: asset.storageKey,
                      mimeType: asset.mimeType,
                    });
                    return asset.sha256;
                  }),
              },
      })),
    })),
  };

  const assets: { sha256: string; extension: string; bytes: Uint8Array }[] = [];
  const missingAssets: string[] = [];

  for (const [sha256, { storageKey, mimeType }] of wanted) {
    try {
      const stored = await storage.get(asStorageKey(storageKey));
      assets.push({ sha256, extension: extensionFor(mimeType), bytes: stored.content });
    } catch {
      // Asset que o banco declara e o storage não tem: o export **continua** e reporta. Abortar
      // por uma figura ausente impediria exportar um acervo inteiro por causa de um arquivo que
      // já estava perdido antes.
      missingAssets.push(sha256);
    }
  }

  return { workspace, assets, missingAssets };
}

const EXTENSIONS: Readonly<Record<string, string>> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/svg+xml": ".svg",
  "application/pdf": ".pdf",
  "text/plain": ".txt",
};

/** A extensão é cosmética — o endereço é o hash. Serve para o zip ser navegável à mão. */
const extensionFor = (mimeType: string): string => EXTENSIONS[mimeType] ?? "";
