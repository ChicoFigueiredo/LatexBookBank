/**
 * O contrato HTTP das rotas do corpo do nó, do jeito que a tela o lê.
 *
 * Só tipos, sem nada de servidor: a rota anota a resposta com eles (`satisfies`) e o cliente
 * (`document-tree/ui/node-body-client.ts`) importa os mesmos (ADR 0010).
 */

/** `POST /api/publications/:id/nodes/:nodeId/body/confirm`, 200: o corpo foi conferido. */
export interface ConfirmNodeBodyResponse {
  readonly confirmed: true;
}
