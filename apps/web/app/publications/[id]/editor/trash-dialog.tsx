"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Badge, Banner, Button, EmptyState, Modal } from "@/design-system";
import { relativeTime } from "@/shared/format/relative-time";

/**
 * A lixeira da publicação (§33).
 *
 * `listDeleted` existia desde a Fase 2 e nenhuma tela a alcançava: dava para excluir e não dava
 * para ver o que foi excluído. Restaurar traz **o nó, a descendência que foi junto, a posição e a
 * questão** — o usuário não deveria precisar saber que por baixo são duas linhas em tabelas
 * diferentes.
 *
 * O que a tela precisa dizer, e diz: um nó cujo ancestral também está na lixeira **não** pode
 * voltar sozinho. Ele voltaria apontando para um pai invisível, sumiria da árvore de novo, e a
 * restauração pareceria ter falhado calada.
 */

interface TrashItem {
  readonly id: string;
  readonly title: string | null;
  readonly kind: string;
  readonly deletedAt: string;
  readonly restorable: boolean;
}

export interface TrashDialogProps {
  readonly publicationId: string;
  readonly open: boolean;
  readonly onClose: () => void;
}

export function TrashDialog({ publicationId, open, onClose }: TrashDialogProps) {
  const router = useRouter();

  const [items, setItems] = useState<readonly TrashItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [age, setAge] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    void fetch(`/api/publications/${publicationId}/trash`)
      .then(async (response) => {
        const payload = (await response.json()) as { items?: TrashItem[]; message?: string };
        if (cancelled) return;

        if (!response.ok) setError(payload.message ?? "Não deu para ler a lixeira.");
        else setItems(payload.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("Não deu para falar com o servidor.");
      });

    return () => {
      cancelled = true;
    };
  }, [publicationId, open, age]);

  const restaurar = async (item: TrashItem) => {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/publications/${publicationId}/nodes/${item.id}/restore`,
        { method: "POST" },
      );

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        // A mensagem vem do servidor porque é lá que a regra vive — "o ancestral continua
        // excluído" nomeia qual ancestral, e reescrevê-la aqui perderia isso.
        setError(payload.message ?? "Não deu para restaurar.");
        return;
      }

      setAge((current) => current + 1);
      // A árvore volta com o nó restaurado, sem recarregar a página.
      router.refresh();
    } catch {
      setError("Não deu para falar com o servidor.");
    } finally {
      setBusy(false);
    }
  };

  const now = new Date();

  return (
    <Modal open={open} onClose={onClose} eyebrow="LIXEIRA" title="Excluídos desta publicação">
      {error && (
        <Banner tone="danger" title="Não deu certo" onDismiss={() => setError(null)}>
          {error}
        </Banner>
      )}

      {items === null ? (
        <p style={{ color: "var(--text-secondary)" }}>lendo a lixeira…</p>
      ) : items.length === 0 ? (
        <EmptyState
          icon="archive"
          title="Nada na lixeira"
          description="Excluir um nó leva a descendência junto — e restaurar traz tudo de volta, na mesma posição."
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 8px",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-md)",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.title ?? "Sem título"}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "var(--text-micro)",
                    color: "var(--text-muted)",
                  }}
                >
                  {item.kind.toLowerCase()} · {relativeTime(new Date(item.deletedAt), now)}
                </div>
              </div>

              {item.restorable ? (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void restaurar(item)}>
                  Restaurar
                </Button>
              ) : (
                // Desabilitado **com motivo**: o botão existe, e a razão de não funcionar é o que
                // diz o que fazer antes.
                <Badge tone="neutral" mono>
                  restaure o pai antes
                </Badge>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
