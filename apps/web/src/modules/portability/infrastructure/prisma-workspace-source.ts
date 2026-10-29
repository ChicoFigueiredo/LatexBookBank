import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";
import { listSourceAssets, type OwnedAssetRow } from "@modules/assets/infrastructure/prisma-owned-assets";
import type {
  RuntimeAsset,
  RuntimeWorkspace,
} from "@modules/portability/application/export-workspace";
import { archiveExtensionFor } from "@modules/portability/domain/portable-schema";
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
 * Os arquivos vêm pelo repositório de assets (`listSourceAssets`), com o dono de cada um: a
 * questão leva os dela, o livro leva os seus — capa, PDFs fonte, figuras do scan — e qualquer
 * arquivo que uma âncora cite e não seja de questão nenhuma do livro.
 *
 * Ver spec §7 · issue #117 · #268.
 */

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

const describe = (row: OwnedAssetRow): RuntimeAsset => ({
  sha256: row.sha256,
  kind: row.kind,
  mimeType: row.mimeType,
  originalFilename: row.originalFilename,
  width: row.width,
  height: row.height,
  metadataJson: row.metadataJson,
});

const iso = (date: Date | null): string | null => (date === null ? null : date.toISOString());

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
        orderBy: [{ createdAt: "asc" }, { title: "asc" }],
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
          publicationDate: true,
          language: true,
          series: true,
          volume: true,
          notes: true,
          captureProfileId: true,
          authors: { orderBy: { position: "asc" }, select: { author: { select: { name: true } } } },
          legacyId: true,
          legacyUuid: true,
          legacyUpdatedAt: true,
          metadataJson: true,
          coverAssetId: true,
          sourcePdfAssetId: true,
          // A lixeira também: excluir tira das telas, não do acervo (v3).
          nodes: {
            orderBy: { sortKey: "asc" },
            select: {
              id: true,
              parentId: true,
              kind: true,
              title: true,
              slug: true,
              sortKey: true,
              numberingStyle: true,
              originalLabel: true,
              legacyId: true,
              deletedAt: true,
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
                      rotation: true,
                      sourceText: true,
                      extractionMethod: true,
                      extractionModel: true,
                      metadataJson: true,
                      sourceAssetId: true,
                      cropAssetId: true,
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
                },
              },
            },
          },
        },
      },
    },
  });
  if (!row) return null;

  // Os ids que o livro cita por ponteiro: capa, PDF fonte e os arquivos das âncoras.
  const cited = row.publications.flatMap((publication) => [
    publication.coverAssetId,
    publication.sourcePdfAssetId,
    ...publication.nodes.flatMap((node) =>
      node.anchors.flatMap(({ sourceAnchor }) => [sourceAnchor.sourceAssetId, sourceAnchor.cropAssetId]),
    ),
  ]);
  const rows = await listSourceAssets(
    workspaceId,
    cited.filter((id): id is string => id !== null),
  );
  const byId = new Map(rows.map((asset) => [asset.id, asset]));

  const byQuestion = new Map<string, OwnedAssetRow[]>();
  const byPublication = new Map<string, OwnedAssetRow[]>();
  for (const asset of rows) {
    if (asset.questionId !== null) {
      byQuestion.set(asset.questionId, [...(byQuestion.get(asset.questionId) ?? []), asset]);
    } else if (asset.publicationId !== null) {
      byPublication.set(asset.publicationId, [...(byPublication.get(asset.publicationId) ?? []), asset]);
    }
  }

  // Os bytes viajam uma vez por hash, seja quem for o dono.
  const wanted = new Map<string, OwnedAssetRow>();
  const shaOf = (id: string | null): string | null => {
    const asset = id === null ? undefined : byId.get(id);
    return asset ? asset.sha256 : null;
  };

  const workspace: RuntimeWorkspace = {
    name: row.name,
    slug: row.slug,
    tags: row.tags,
    publications: row.publications.map((publication) => {
      // Os arquivos das questões deste livro; o que o livro citar e não estiver aqui é dele.
      const questionAssets = new Map<string, readonly OwnedAssetRow[]>();
      const inQuestions = new Set<string>();
      for (const node of publication.nodes) {
        if (node.question === null) continue;
        const own = byQuestion.get(node.question.id) ?? [];
        questionAssets.set(node.question.id, own);
        for (const asset of own) inQuestions.add(asset.sha256);
      }

      const own = new Map<string, OwnedAssetRow>();
      for (const asset of byPublication.get(publication.id) ?? []) {
        if (!own.has(asset.sha256)) own.set(asset.sha256, asset);
      }
      const pointed = [
        publication.coverAssetId,
        publication.sourcePdfAssetId,
        ...publication.nodes.flatMap((node) =>
          node.anchors.flatMap(({ sourceAnchor }) => [sourceAnchor.sourceAssetId, sourceAnchor.cropAssetId]),
        ),
      ];
      for (const id of pointed) {
        const asset = id === null ? undefined : byId.get(id);
        if (asset && !own.has(asset.sha256) && !inQuestions.has(asset.sha256)) own.set(asset.sha256, asset);
      }

      for (const asset of [...own.values(), ...[...questionAssets.values()].flat()]) {
        if (!wanted.has(asset.sha256)) wanted.set(asset.sha256, asset);
      }

      return {
        id: publication.id,
        title: publication.title,
        subtitle: publication.subtitle,
        publisher: publication.publisher,
        nickname: publication.nickname,
        isbn: publication.isbn,
        otherIdentifier: publication.otherIdentifier,
        edition: publication.edition,
        editionYear: publication.editionYear,
        publicationDate: iso(publication.publicationDate),
        language: publication.language,
        series: publication.series,
        volume: publication.volume,
        notes: publication.notes,
        authors: publication.authors.map((entry) => entry.author.name),
        captureProfileId: publication.captureProfileId,
        legacyId: publication.legacyId,
        legacyUuid: publication.legacyUuid,
        legacyUpdatedAt: iso(publication.legacyUpdatedAt),
        metadataJson: publication.metadataJson,
        assets: [...own.values()].map(describe),
        coverAssetSha256: shaOf(publication.coverAssetId),
        sourcePdfAssetSha256: shaOf(publication.sourcePdfAssetId),
        nodes: publication.nodes.map((node) => {
          const anchors = node.anchors.flatMap(({ role, sourceAnchor: anchor }) => {
            const sha256 = shaOf(anchor.sourceAssetId);
            // Âncora cujo PDF não existe mais em linha nenhuma: não há o que apontar no destino.
            if (sha256 === null) return [];
            return [
              {
                sha256,
                cropSha256: shaOf(anchor.cropAssetId),
                pageNumber: anchor.pageNumber,
                box: {
                  x: anchor.xNormalized,
                  y: anchor.yNormalized,
                  width: anchor.widthNormalized,
                  height: anchor.heightNormalized,
                },
                rotation: anchor.rotation,
                role,
                sourceText: anchor.sourceText,
                extractionMethod: anchor.extractionMethod,
                extractionModel: anchor.extractionModel,
                metadataJson: anchor.metadataJson,
              },
            ];
          });

          return {
              id: node.id,
              parentId: node.parentId,
              kind: node.kind,
              title: node.title,
              slug: node.slug,
              sortKey: node.sortKey,
              numberingStyle: node.numberingStyle,
              originalLabel: node.originalLabel,
              legacyId: node.legacyId,
              deletedAt: iso(node.deletedAt),
              bodyLatex: node.bodyLatex,
              anchors,
              question:
                node.question === null
                  ? null
                  : {
                      ...node.question,
                      tags: node.question.tags.map((link) => link.tag.name),
                      assets: dedupe(questionAssets.get(node.question.id) ?? []).map(describe),
                    },
          };
        }),
      };
    }),
  };

  const assets: { sha256: string; extension: string; bytes: Uint8Array }[] = [];
  const missingAssets: string[] = [];

  for (const [sha256, { storageKey, mimeType }] of wanted) {
    try {
      const stored = await storage.get(asStorageKey(storageKey));
      assets.push({ sha256, extension: archiveExtensionFor(mimeType), bytes: stored.content });
    } catch {
      // Asset que o banco declara e o storage não tem: o export **continua** e reporta. Abortar
      // por uma figura ausente impediria exportar um acervo inteiro por causa de um arquivo que
      // já estava perdido antes.
      missingAssets.push(sha256);
    }
  }

  return { workspace, assets, missingAssets };
}

/** A mesma linha duas vezes para o mesmo dono (dado antigo) é um arquivo só no formato. */
function dedupe(rows: readonly OwnedAssetRow[]): readonly OwnedAssetRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.sha256}:${row.kind}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
