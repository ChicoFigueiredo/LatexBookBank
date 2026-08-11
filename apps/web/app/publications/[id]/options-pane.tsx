"use client";

import { useCallback, useEffect, useState } from "react";

import { Banner } from "@/design-system";
import type { OptionRecord } from "@modules/questions/domain/option-mutations";
import { OptionsEditor } from "@modules/questions/ui/OptionsEditor";

/**
 * As alternativas, ligadas às rotas.
 *
 * O `OptionsEditor` é puro de propósito — ele recebe a lista e cinco callbacks, e não sabe que
 * existe servidor. O que mora aqui é o outro lado: carregar, chamar as rotas e **recarregar a
 * lista depois de cada mutação**.
 *
 * Recarregar em vez de atualizar em memória é escolha, não preguiça: marcar uma correta desmarca
 * a outra do lado do servidor, e reproduzir essa regra no cliente seria tê-la em dois lugares —
 * com um deles ficando para trás. A resposta do banco é a única que não mente.
 *
 * Ver spec §8.5 · D9 · issue #139.
 */

export interface OptionsPaneProps {
  readonly publicationId: string;
  readonly questionId: string;
  /** O tipo decide se o gabarito é exclusivo. Vem de fora: a lista de alternativas não o conhece. */
  readonly exclusive?: boolean;
  readonly disabled?: boolean;
}

export function OptionsPane({
  publicationId,
  questionId,
  exclusive = true,
  disabled = false,
}: OptionsPaneProps) {
  const base = `/api/publications/${publicationId}/questions/${questionId}/options`;

  const [loaded, setLoaded] = useState<{ questionId: string; options: readonly OptionRecord[] }>({
    questionId: "",
    options: [],
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Um contador em vez de uma função de recarga chamada de dentro do efeito: o efeito busca, e
  // quem muta só diz que a lista envelheceu. É também o que mantém uma única origem para o
  // `fetch`, em vez de duas que precisam concordar.
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let cancelled = false;

    void fetch(base)
      .then(async (response) => {
        const payload = (await response.json()) as { options?: OptionRecord[]; message?: string };
        if (cancelled) return;

        if (!response.ok) setError(payload.message ?? "Não deu para ler as alternativas.");
        else {
          setError(null);
          setLoaded({ questionId, options: payload.options ?? [] });
        }
      })
      .catch(() => {
        if (!cancelled) setError("Não deu para falar com o servidor.");
      });

    return () => {
      cancelled = true;
    };
  }, [base, questionId, generation]);

  /** Toda mutação passa por aqui: chama, confere e marca a lista como velha. */
  const mutate = useCallback(async (input: RequestInfo, init: RequestInit) => {
    setBusy(true);
    try {
      const response = await fetch(input, init);
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { message?: string };
        setError(payload.message ?? `A alteração não foi aceita (status ${response.status}).`);
        return;
      }
      setGeneration((current) => current + 1);
    } catch {
      setError("Não deu para falar com o servidor.");
    } finally {
      setBusy(false);
    }
  }, []);

  const json = (body: unknown): RequestInit => ({
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const options = loaded.questionId === questionId ? loaded.options : [];

  return (
    <div style={{ padding: "var(--space-3)", overflow: "auto", height: "100%" }}>
      {error !== null && (
        <Banner tone="danger" title="Não deu certo">
          {error}
        </Banner>
      )}

      <OptionsEditor
        options={options}
        exclusive={exclusive}
        disabled={disabled || busy}
        onAdd={() => void mutate(base, { method: "POST" })}
        onRemove={(optionId) => void mutate(`${base}/${optionId}`, { method: "DELETE" })}
        onMove={(optionId, targetIndex) =>
          void mutate(`${base}/${optionId}`, json({ targetIndex }))
        }
        // Sempre `true`: o **domínio** decide se isso desmarca as outras ou alterna, conforme o
        // tipo (`patchesForCorrect`). Mandar `false` daqui duplicaria a regra no cliente.
        onSetCorrect={(optionId) => void mutate(`${base}/${optionId}`, json({ isCorrect: true }))}
        onEdit={(optionId, statementLatex) =>
          void mutate(`${base}/${optionId}`, json({ statementLatex }))
        }
      />
    </div>
  );
}
