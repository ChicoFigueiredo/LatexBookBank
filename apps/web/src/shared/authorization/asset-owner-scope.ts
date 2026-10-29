import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";

import { resolveQuestionScope } from "./question-scope";

/**
 * O dono de um arquivo que está entrando, **resolvido no servidor** (#256, SEC-06 e ACV-12).
 *
 * Upload e recorte recebem até três ids no formulário — biblioteca, livro e questão — e os
 * gravavam soltos. Nada dizia que concordavam entre si: um PDF guardado sob a biblioteca A virava
 * a fonte de um livro da B, e excluir A deixava B apontando para bytes apagados. Um `workspaceId`
 * inventado criava diretório e arquivo no storage antes de o banco recusar a linha.
 *
 * A regra é a da #175, generalizada: **o livro manda**. Quando ele vem, a biblioteca sai dele; a
 * do formulário, quando também vem, precisa ser a mesma. A questão, quando vem, precisa ser daquele
 * livro (`resolveQuestionScope`) — ou, sem livro, daquela biblioteca.
 *
 * `null` é "não existe" **ou** "não é daqui", e os dois viram 404, pela razão que a #175 dá:
 * distinguir conta a quem perguntou que o id acertou.
 */

export interface AssetOwnerClaim {
  /** Do formulário, ou do asset de origem no recorte. Opcional quando o livro vem. */
  readonly workspaceId: string | null;
  readonly publicationId: string | null;
  readonly questionId: string | null;
}

export interface AssetOwnerScope {
  /** O prefixo do storage. Sempre o do banco, nunca o do formulário. */
  readonly workspaceId: string;
  readonly publicationId: string | null;
  readonly questionId: string | null;
}

export async function resolveAssetOwner(claim: AssetOwnerClaim): Promise<AssetOwnerScope | null> {
  const workspaceId = await ownerWorkspace(claim);
  if (workspaceId === null) return null;

  return { workspaceId, publicationId: claim.publicationId, questionId: claim.questionId };
}

async function ownerWorkspace(claim: AssetOwnerClaim): Promise<string | null> {
  if (claim.publicationId !== null) {
    const publication = await prisma.publication.findUnique({
      where: { id: claim.publicationId },
      select: { workspaceId: true },
    });
    if (publication === null) return null;
    if (claim.workspaceId !== null && claim.workspaceId !== publication.workspaceId) return null;

    if (claim.questionId !== null) {
      const question = await resolveQuestionScope(claim.publicationId, claim.questionId);
      if (question === null) return null;
    }
    return publication.workspaceId;
  }

  if (claim.workspaceId === null) return null;

  const workspace = await prisma.workspace.findUnique({
    where: { id: claim.workspaceId },
    select: { id: true },
  });
  if (workspace === null) return null;

  if (claim.questionId !== null) {
    // Sem livro, a questão precisa ao menos ser desta biblioteca: a cadeia questão → nó → livro.
    const question = await prisma.question.findFirst({
      where: { id: claim.questionId, node: { publication: { workspaceId: workspace.id } } },
      select: { id: true },
    });
    if (question === null) return null;
  }
  return workspace.id;
}
