import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";

/**
 * O arquivo-fonte que um livro já tem no acervo.
 *
 * Read model minúsculo, e num módulo em vez de dentro da página, porque o lint deste projeto tem
 * uma regra que vale a pena: **componente React não acessa a camada de banco**. Ela pegou a
 * primeira versão disto — um `prisma.asset.findUnique` dentro do Server Component — e estava
 * certa: a página não deve saber que existe uma tabela `Asset`.
 *
 * Existe para a captura oferecer “usar o PDF do livro” em vez de mandar procurar no disco o
 * arquivo que a importação do Calibre já trouxe para dentro.
 */

export interface FonteDoLivro {
  readonly assetId: string;
  readonly filename: string;
  readonly mimeType: string;
}

export async function readBookSource(
  sourcePdfAssetId: string | null,
): Promise<FonteDoLivro | null> {
  if (sourcePdfAssetId === null) return null;

  const asset = await prisma.asset.findUnique({
    where: { id: sourcePdfAssetId },
    select: { id: true, originalFilename: true, mimeType: true },
  });

  if (asset === null) return null;

  return {
    assetId: asset.id,
    // O nome do arquivo pode faltar num asset vindo de importação antiga; o botão precisa de um
    // rótulo, e "fonte.pdf" é melhor que um botão sem nome.
    filename: asset.originalFilename ?? "fonte.pdf",
    mimeType: asset.mimeType,
  };
}
