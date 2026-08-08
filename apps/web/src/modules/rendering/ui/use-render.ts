"use client";

import { useCallback, useRef, useState } from "react";

import type { RenderStatus } from "./RenderPanel";

/**
 * Dispara a compilação e guarda o estado dela.
 *
 * A compilação acontece na requisição (não há fila), então isto é um `fetch` e um estado. O que
 * este hook tem de próprio são as três decisões abaixo — todas sobre o que fazer quando algo dá
 * errado, que é o caminho que a interface passa mais tempo escondendo.
 */

export interface UseRenderOptions {
  readonly publicationId: string;
  readonly questionId: string;
  readonly profileId?: string;
}

export function useRender({ publicationId, questionId, profileId }: UseRenderOptions): {
  readonly status: RenderStatus;
  readonly render: () => void;
} {
  const [status, setStatus] = useState<RenderStatus>({ kind: "idle" });

  /**
   * Guarda a compilação em voo.
   *
   * Sem isto, apertar `Ctrl+Enter` três vezes dispararia três `pdflatex` para o mesmo documento —
   * e é justamente enquanto a primeira demora que a pessoa aperta de novo.
   */
  const inFlight = useRef(false);

  const render = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    setStatus({ kind: "running" });

    void (async () => {
      try {
        const response = await fetch(
          `/api/publications/${publicationId}/questions/${questionId}/render`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(profileId === undefined ? {} : { profileId }),
          },
        );

        const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

        if (response.status === 503) {
          // Worker fora do ar ou não configurado. **Não** é erro do documento, e a interface
          // precisa separar os dois: pintar de vermelho manda a pessoa procurar defeito no texto.
          setStatus({
            kind: "unavailable",
            message: String(payload["message"] ?? "O worker de render não respondeu."),
          });
          return;
        }

        if (!response.ok) {
          setStatus({
            kind: "error",
            message: String(payload["message"] ?? `Falha ao compilar (HTTP ${response.status}).`),
          });
          return;
        }

        setStatus({ kind: "done", outcome: payload as never });
      } catch {
        setStatus({
          kind: "unavailable",
          message:
            "Não foi possível falar com o servidor. O texto continua salvo; " +
            "o PDF sai quando a conexão voltar.",
        });
      } finally {
        inFlight.current = false;
      }
    })();
  }, [publicationId, questionId, profileId]);

  return { status, render };
}
