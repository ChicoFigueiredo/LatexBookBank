"use client";

import type {
  ImportArchiveResponse,
  ImportSimulationResponse,
} from "@modules/portability/application/import-contract";
import { requestJson } from "@/shared/http/api-client";

/**
 * A rota de importar `.lbb`, tipada pelo contrato que ela mesma anota (ADR 0010).
 *
 * Recusa vira `ApiError`, com a mensagem da rota — inclusive o 409 de colisão sem aceite (#270).
 * Rede fora ou corpo que não é JSON sobem como o erro do `fetch`.
 */

const post = <T>(file: Blob, query: string): Promise<T> =>
  requestJson<T>(`/api/workspaces/import${query}`, {
    method: "POST",
    headers: { "content-type": "application/zip" },
    body: file,
  });

export const importApi = {
  /** O ensaio: o que o arquivo traz e com o que colide, sem gravar nada. */
  simulate: (file: Blob) => post<ImportSimulationResponse>(file, "?dryRun=1"),

  /**
   * Grava. `acceptCollisions` é a pessoa ter visto os conflitos e escolhido importar como cópia: o
   * servidor recusa a gravação com colisão sem ele, e um conflito que surja entre a simulação e
   * a gravação volta como recusa, não passa calado.
   */
  run: (file: Blob, { acceptCollisions }: { readonly acceptCollisions: boolean }) =>
    post<ImportArchiveResponse>(file, acceptCollisions ? "?acceptCollisions=1" : ""),
};
