"use client";

import { useCallback, useEffect, useState } from "react";

import { Banner } from "@/design-system";
import type { TagSuggestion } from "@modules/questions/domain/tag";
import { TagsPanel } from "@modules/questions/ui/TagsPanel";

/**
 * As tags, ligadas às rotas.
 *
 * Mesmo desenho do painel de alternativas: o componente é puro e a lista **volta do servidor**
 * depois de cada mutação. Aqui isso importa ainda mais — aplicar "funcao quadratica" quando já
 * existe "Função Quadrática" devolve a tag existente, com a grafia dela. Montar o estado no
 * cliente mostraria a grafia digitada até alguém recarregar a página.
 *
 * Ver spec §33 · issue #141.
 */

export interface TagsPaneProps {
  readonly questionId: string;
  readonly workspaceId: string;
  readonly disabled?: boolean;
}

interface TagRow {
  readonly id: string;
  readonly name: string;
}

export function TagsPane({ questionId, workspaceId, disabled = false }: TagsPaneProps) {
  const [loaded, setLoaded] = useState<{ questionId: string; tags: readonly TagRow[] }>({
    questionId: "",
    tags: [],
  });
  const [suggestions, setSuggestions] = useState<readonly TagSuggestion[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let cancelled = false;

    void fetch(`/api/questions/${questionId}/tags`)
      .then(async (response) => {
        const payload = (await response.json()) as { tags?: TagRow[]; message?: string };
        if (cancelled) return;

        if (!response.ok) setError(payload.message ?? "Não deu para ler as tags.");
        else {
          setError(null);
          setLoaded({ questionId, tags: payload.tags ?? [] });
        }
      })
      .catch(() => {
        if (!cancelled) setError("Não deu para falar com o servidor.");
      });

    return () => {
      cancelled = true;
    };
  }, [questionId, generation]);

  useEffect(() => {
    let cancelled = false;

    // As sugestões acompanham a digitação. A ordenação é do servidor (`rankSuggestions`), e não
    // daqui: ordenar nos dois lados daria duas respostas para "qual vem primeiro".
    void fetch(`/api/workspaces/${workspaceId}/tags?q=${encodeURIComponent(query)}`)
      .then(async (response) => {
        const payload = (await response.json()) as { tags?: TagSuggestion[] };
        if (!cancelled && response.ok) setSuggestions(payload.tags ?? []);
      })
      .catch(() => {
        // Falha aqui não é erro de tela: sem sugestão ainda dá para digitar a tag inteira.
      });

    return () => {
      cancelled = true;
    };
  }, [workspaceId, query, generation]);

  const mutate = useCallback(async (input: RequestInfo, init: RequestInit) => {
    setBusy(true);
    try {
      const response = await fetch(input, init);
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { message?: string };
        setError(payload.message ?? `A alteração não foi aceita (status ${response.status}).`);
        return;
      }
      setError(null);
      setGeneration((current) => current + 1);
    } catch {
      setError("Não deu para falar com o servidor.");
    } finally {
      setBusy(false);
    }
  }, []);

  const applied = loaded.questionId === questionId ? loaded.tags : [];

  return (
    <div style={{ padding: "var(--space-3)", overflow: "auto", height: "100%" }}>
      {error !== null && (
        <Banner tone="danger" title="Não deu certo">
          {error}
        </Banner>
      )}

      <TagsPanel
        applied={applied}
        suggestions={suggestions}
        disabled={disabled || busy}
        onQueryChange={setQuery}
        onApply={(names) =>
          void mutate(`/api/questions/${questionId}/tags`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ names }),
          })
        }
        onRemove={(tagId) =>
          void mutate(`/api/questions/${questionId}/tags/${tagId}`, { method: "DELETE" })
        }
      />
    </div>
  );
}
