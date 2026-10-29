/**
 * O contrato HTTP das rotas da lixeira do acervo, do jeito que a tela o lê.
 *
 * Só tipos, sem nada de servidor: a rota anota a resposta com eles (`satisfies`) e o cliente
 * (`document-tree/ui/trash-client.ts`) importa os mesmos (ADR 0010).
 */

/** `GET /api/trash`, 200: os números da lixeira no momento da pergunta. */
export interface TrashSummaryResponse {
  readonly itemCount: number;
  readonly objectCount: number;
  readonly footer: string;
}

/** O que o esvaziar deixou na lixeira porque uma avaliação usa (#258). */
export interface HeldTrashItem {
  readonly nodeId: string;
  /** "Questão 7 · PA" — o mesmo nome que a linha da lixeira mostra. */
  readonly title: string;
  readonly assessments: readonly string[];
}

/** `DELETE /api/trash`, 200: o que saiu de vez, e o que ficou preso a uma prova. */
export interface EmptyTrashResponse {
  readonly deleted: { readonly nodes: number; readonly questions: number };
  readonly held: readonly HeldTrashItem[];
}

/** `POST /api/publications/:id/nodes/:nodeId/restore`, 200: os nós que voltaram. */
export interface RestoreNodeResponse {
  readonly restored: readonly string[];
}
