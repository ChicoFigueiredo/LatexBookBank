"use client";

import type { ConfirmNodeBodyResponse } from "@modules/document-tree/application/node-body-contract";
import { readLenientReply, type JsonReply } from "@/shared/http/api-client";

/** As rotas do corpo do nó, tipadas pelo contrato que elas mesmas anotam (ADR 0010). */
export const nodeBodyApi = {
  /**
   * *Conferido* no corpo que o scan escreveu (#252). Devolve a resposta lida, sem lançar na
   * recusa: a tela recarrega com sucesso ou recusa, e só a rede fora interrompe.
   */
  confirm: (publicationId: string, nodeId: string): Promise<JsonReply<ConfirmNodeBodyResponse>> =>
    readLenientReply<ConfirmNodeBodyResponse>(
      `/api/publications/${publicationId}/nodes/${nodeId}/body/confirm`,
      { method: "POST" },
    ),
};
