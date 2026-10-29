"use client";

import type {
  EmptyTrashResponse,
  RestoreNodeResponse,
  TrashSummaryResponse,
} from "@modules/document-tree/application/trash-contract";
import { readReply, type JsonReply } from "@/shared/http/api-client";

/**
 * As rotas da lixeira do acervo, tipadas pelo contrato que elas mesmas anotam (ADR 0010).
 *
 * Cada função devolve a resposta lida (`JsonReply`), e a tela decide: a recusa vira a mensagem da
 * rota ou a dela, e o número que não veio cai no da página. Rede fora ou corpo que não é JSON
 * sobem como o erro do `fetch`, que a tela diz como "não deu para falar com o servidor".
 */
export const trashApi = {
  /** Os números no momento do clique, para o aviso do esvaziar não mentir por desatualização. */
  summary: (): Promise<JsonReply<TrashSummaryResponse>> =>
    readReply<TrashSummaryResponse>("/api/trash"),

  empty: (): Promise<JsonReply<EmptyTrashResponse>> =>
    readReply<EmptyTrashResponse>("/api/trash", { method: "DELETE" }),

  /** Restaurar usa a rota do livro: a regra do ancestral excluído é por publicação e mora lá. */
  restore: (publicationId: string, nodeId: string): Promise<JsonReply<RestoreNodeResponse>> =>
    readReply<RestoreNodeResponse>(`/api/publications/${publicationId}/nodes/${nodeId}/restore`, {
      method: "POST",
    }),
};
