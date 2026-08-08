"use client";

import { useCallback, useMemo, useState } from "react";

import { createCoalescer } from "@modules/rendering/domain/coalescer";

import type { RenderStatus } from "./RenderPanel";

/**
 * Dispara a compilação e guarda o estado dela.
 *
 * A compilação acontece na requisição (não há fila no servidor), então isto é um `fetch` e um
 * estado. O que este hook tem de próprio é o **coalescing** e a separação entre "worker fora do
 * ar" e "documento com erro" — os dois caminhos que a interface passa mais tempo escondendo.
 */

export interface UseRenderOptions {
  readonly publicationId: string;
  readonly questionId: string;
  readonly profileId?: string;
}

/** Traduz a resposta HTTP no estado que o painel entende. */
async function toStatus(response: Response): Promise<RenderStatus> {
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (response.status === 503) {
    // Worker fora do ar ou não configurado. **Não** é erro do documento, e a interface precisa
    // separar os dois: pintar de vermelho manda a pessoa procurar defeito no texto dela.
    return {
      kind: "unavailable",
      message: String(payload["message"] ?? "O worker de render não respondeu."),
    };
  }
  if (!response.ok) {
    return {
      kind: "error",
      message: String(payload["message"] ?? `Falha ao compilar (HTTP ${response.status}).`),
    };
  }
  return { kind: "done", outcome: payload as never };
}

export function useRender({ publicationId, questionId, profileId }: UseRenderOptions): {
  readonly status: RenderStatus;
  readonly render: () => void;
} {
  const [status, setStatus] = useState<RenderStatus>({ kind: "idle" });

  /**
   * O coalescer vive num `useMemo` e não num `useRef`: ele depende dos identificadores, e trocar
   * de questão precisa produzir um coalescer novo. Com `useRef`, um pedido pendente da questão
   * anterior compilaria depois da troca e sobrescreveria a tela com o PDF da questão errada.
   */
  const coalescer = useMemo(
    () =>
      createCoalescer<RenderStatus>({
        run: async () => {
          setStatus({ kind: "running" });
          const response = await fetch(
            `/api/publications/${publicationId}/questions/${questionId}/render`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(profileId === undefined ? {} : { profileId }),
            },
          );
          return toStatus(response);
        },
        // Só o resultado que sobreviveu ao coalescing chega aqui — o intermediário nem é
        // entregue, então não existe filtro a esquecer depois.
        commit: setStatus,
        fail: () =>
          setStatus({
            kind: "unavailable",
            message:
              "Não foi possível falar com o servidor. O texto continua salvo; " +
              "o PDF sai quando a conexão voltar.",
          }),
      }),
    [publicationId, questionId, profileId],
  );

  const render = useCallback(() => void coalescer.request(), [coalescer]);

  return { status, render };
}
