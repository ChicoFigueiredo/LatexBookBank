import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";
import type { StoredAssetRecord } from "@modules/assets/application/store-asset";
import type { AssetWriter, NewAsset, WrittenAsset } from "@modules/assets/domain/book-source";
import {
  isAnchorRole,
  planNodeAnchors,
  type NodeAnchorLink,
} from "@modules/assets/domain/node-anchors";
import type { NormalizedBox } from "@modules/assets/domain/source-anchor";
import { writeNodeAnchors } from "@modules/assets/infrastructure/prisma-node-anchors";

/**
 * Escrita de assets e de âncoras.
 *
 * **A fonte é imutável e nunca é substituída** (D29). Não existe função de `update` aqui: um
 * arquivo alterado vira um asset novo, porque a `storageKey` contém o hash do conteúdo. Um crop,
 * um OCR ou um texto extraído são registros **adicionais** que apontam para a fonte — nunca
 * escrita por cima dela.
 *
 * Ver spec §10 · D28 · D29 · issue #123.
 */

export interface CreateAssetInput extends StoredAssetRecord {
  readonly workspaceId: string;
  readonly questionId?: string | null;
  readonly publicationId?: string | null;
}

/** O cliente dentro da transação. `prisma.$transaction` entrega um cliente restrito. */
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export async function createAsset(input: CreateAssetInput): Promise<{ id: string }> {
  return createAssetWith(prisma, input);
}

async function createAssetWith(client: Tx, input: CreateAssetInput): Promise<{ id: string }> {
  // **O arquivo é deduplicado; a linha, não** (#254). O storage já guarda um arquivo só por
  // conteúdo — a `storageKey` contém o hash —, e esta tabela guarda quem o usa. A mesma figura em
  // duas questões é o caso comum, e cada questão precisa da **sua** linha: o render procura os
  // assets pelo `questionId` (ou pelo `publicationId`, no corpo do livro) e cita o nome que sai
  // do `originalFilename` gravado. Devolver a linha de quem subiu primeiro deixava a segunda
  // questão sem a figura, ou com um nome que o `\includegraphics` dela não cita.
  //
  // Só a mesma linha volta: mesma chave, mesmo dono, mesmo nome, mesmo tipo. É o reenvio do mesmo
  // arquivo para o mesmo lugar — um duplo clique, uma varredura repetida —, e ele não acumula
  // linhas. Apagar continua seguro com várias linhas por chave: o arquivo só sai do disco quando
  // nenhuma linha resta com ela (#243).
  //
  // `renderJobId: null` é o que impede o pior desfecho possível: reaproveitar a linha de um
  // **artefato de render** para um arquivo que a pessoa subiu. Ela é `onDelete: Cascade` do job,
  // e descartar o job — que a D29 diz ser sempre permitido — levaria junto a fonte de alguém.
  // Derivado é descartável; a fonte é patrimônio, e as duas coisas não podem dividir uma linha.
  const existing = await client.asset.findFirst({
    where: {
      storageKey: input.storageKey,
      renderJobId: null,
      workspaceId: input.workspaceId,
      publicationId: input.publicationId ?? null,
      questionId: input.questionId ?? null,
      originalFilename: input.originalFilename,
      kind: input.kind,
    },
    select: { id: true },
  });
  if (existing) return existing;

  return client.asset.create({
    data: {
      workspaceId: input.workspaceId,
      questionId: input.questionId ?? null,
      publicationId: input.publicationId ?? null,
      kind: input.kind,
      storageKey: input.storageKey,
      mimeType: input.mimeType,
      originalFilename: input.originalFilename,
      sha256: input.sha256,
      sizeBytes: input.sizeBytes,
      width: input.width,
      height: input.height,
    },
    select: { id: true },
  });
}

/**
 * O `AssetWriter` do domínio, em Prisma.
 *
 * O que ele acrescenta ao `createAsset` é a única coisa que o registro de um upload não podia
 * fazer em dois passos: gravar o asset e apontar `Publication.sourcePdfAssetId` para ele **juntos**.
 *
 * O `updateMany` com `sourcePdfAssetId: null` no `where` é a peça inteira da concorrência. Não é
 * um `update` com leitura antes: ler para decidir e escrever depois deixa uma janela em que dois
 * uploads simultâneos leem "sem fonte" e o segundo sobrescreve o primeiro. Aqui o filtro é a
 * própria escrita — o SQLite aplica a condição na hora, e o perdedor volta com `count: 0`, asset
 * gravado e pertencendo ao livro, fonte inalterada. É também o que impede um upload de substituir
 * uma fonte que já existe (D29).
 */
export class PrismaAssetWriter implements AssetWriter {
  async write(asset: NewAsset, asBookSourceOf: string | null): Promise<WrittenAsset> {
    if (asBookSourceOf === null) {
      const created = await createAsset(asset);
      return { id: created.id, becameBookSource: false };
    }

    return prisma.$transaction(async (tx) => {
      const created = await createAssetWith(tx, asset);

      const attached = await tx.publication.updateMany({
        where: { id: asBookSourceOf, sourcePdfAssetId: null },
        data: { sourcePdfAssetId: created.id },
      });

      return { id: created.id, becameBookSource: attached.count > 0 };
    });
  }
}

export interface CreateAnchorInput {
  readonly publicationId: string;
  readonly sourceAssetId: string;
  readonly pageNumber: number;
  readonly box: NormalizedBox;
  readonly rotation: number | null;
  readonly cropAssetId: string | null;
  readonly sourceText?: string | null;
  readonly extractionMethod?: string | null;
  readonly extractionModel?: string | null;
}

export async function createAnchor(input: CreateAnchorInput): Promise<{ id: string }> {
  return prisma.sourceAnchor.create({
    data: {
      publicationId: input.publicationId,
      sourceAssetId: input.sourceAssetId,
      pageNumber: input.pageNumber,
      // Normalizadas, sempre. A coluna não guarda pixel (D28).
      xNormalized: input.box.x,
      yNormalized: input.box.y,
      widthNormalized: input.box.width,
      heightNormalized: input.box.height,
      rotation: input.rotation,
      cropAssetId: input.cropAssetId,
      sourceText: input.sourceText ?? null,
      extractionMethod: input.extractionMethod ?? null,
      extractionModel: input.extractionModel ?? null,
    },
    select: { id: true },
  });
}

/** Liga a questão à âncora. É o que faz "voltar à origem" funcionar a partir dela. */
export async function attachAnchorToQuestion(
  questionId: string,
  sourceAnchorId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.question.update({ where: { id: questionId }, data: { sourceAnchorId } });

    // O nó da questão ganha a âncora como principal (D50). As que ele já tinha continuam, depois
    // dela: religar a origem não apaga a continuação que alguém marcou.
    const node = await tx.documentNode.findUnique({ where: { questionId }, select: { id: true } });
    if (!node) return;

    const current = await tx.documentNodeAnchor.findMany({
      where: { documentNodeId: node.id },
      orderBy: { sortOrder: "asc" },
      select: { sourceAnchorId: true, role: true },
    });
    const rest = current
      .filter((link) => link.sourceAnchorId !== sourceAnchorId)
      .map((link) => ({
        sourceAnchorId: link.sourceAnchorId,
        role: link.role === "PRIMARY" ? ("CONTINUATION" as const) : link.role,
      }));

    await writeNodeAnchors(
      tx,
      node.id,
      planNodeAnchors(
        [{ sourceAnchorId, role: "PRIMARY" as const }, ...rest].filter(
          (link): link is NodeAnchorLink => isAnchorRole(link.role),
        ),
      ),
    );
  });
}

export interface SourceAssetRef {
  readonly id: string;
  readonly kind: string;
  readonly originalFilename: string | null;
  readonly workspaceId: string;
}

export async function findAsset(assetId: string): Promise<SourceAssetRef | null> {
  return prisma.asset.findUnique({
    where: { id: assetId },
    select: { id: true, kind: true, originalFilename: true, workspaceId: true },
  });
}
