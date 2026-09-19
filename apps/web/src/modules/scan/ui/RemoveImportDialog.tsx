"use client";

import { useEffect, useState } from "react";

import { Badge, Banner, Button, Modal } from "@/design-system";

import { scanApi, type ImportPreview } from "./scan-client";

/**
 * Apagar para reimportar (D57, [ADR 0006](../../../../../docs/adr/0006-a-importacao-e-apagavel.md)).
 *
 * Duas ações, e a diferença entre elas é a razão deste diálogo existir: uma refaz a análise, a
 * outra mexe no acervo. Os **números vêm antes** — quantos nós vão para a lixeira, por tipo, e
 * quantos ficam de pé porque alguém os editou à mão. Um botão "apagar importação" sem esses
 * números seria pedir uma decisão no escuro, sobre trabalho de dias.
 */

const KIND_NAMES: Readonly<Record<string, string>> = {
  BOOK: "livro",
  PART: "parte",
  CHAPTER: "capítulo",
  SECTION: "seção",
  SUBSECTION: "subseção",
  CONTENT: "conteúdo",
  QUESTION_GROUP: "grupo",
  QUESTION: "questão",
  FIGURE: "figura",
  NOTE: "nota",
  EXAMPLE: "exemplo",
};

const plural = (kind: string, count: number): string => {
  const name = KIND_NAMES[kind] ?? kind.toLowerCase();
  if (count === 1) return `1 ${name}`;
  return `${count} ${name.endsWith("m") ? `${name.slice(0, -1)}ns` : name.endsWith("ão") ? `${name.slice(0, -2)}ões` : `${name}s`}`;
};

export interface RemoveImportDialogProps {
  readonly runId: string;
  readonly onClose: () => void;
  /** Chamado depois de apagar: a tela de cima decide para onde ir. */
  readonly onRemoved: (scope: "proposal" | "import") => void;
}

export function RemoveImportDialog({ runId, onClose, onRemoved }: RemoveImportDialogProps) {
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"proposal" | "import" | null>(null);

  useEffect(() => {
    let cancelled = false;
    void scanApi
      .importPreview(runId)
      .then((data) => {
        if (!cancelled) setPreview(data);
      })
      .catch((problem: unknown) => {
        if (!cancelled) setError(problem instanceof Error ? problem.message : String(problem));
      });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  const remove = async (scope: "proposal" | "import") => {
    setBusy(scope);
    try {
      await scanApi.removeImport(runId, scope);
      onRemoved(scope);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
      setBusy(null);
    }
  };

  const counts = Object.entries(preview?.counts ?? {});

  return (
    <Modal
      open
      {...(busy ? {} : { onClose })}
      closeOnScrim={false}
      eyebrow="REIMPORTAR"
      title="Apagar esta varredura?"
      width={560}
      footer={
        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
          <Button variant="ghost" disabled={busy !== null} onClick={onClose}>
            Cancelar
          </Button>
          <span style={{ flex: 1 }} />
          <Button
            variant="secondary"
            loading={busy === "proposal"}
            // Depois de aprovada, apagar só a proposta cegaria o acervo: os nós ficariam com o id
            // de uma execução que não existe mais, e ninguém acharia o que ela criou.
            disabled={busy !== null || (preview?.created ?? 0) > 0}
            title={(preview?.created ?? 0) > 0 ? "Esta varredura já criou nós no acervo" : undefined}
            onClick={() => void remove("proposal")}
          >
            Só a proposta
          </Button>
          <Button
            variant="danger"
            icon="archive"
            loading={busy === "import"}
            disabled={busy !== null || preview === null}
            onClick={() => void remove("import")}
          >
            A proposta e o acervo
          </Button>
        </div>
      }
    >
      {error && (
        <Banner tone="danger" title="Não deu para ler o que esta varredura criou">
          {error}
        </Banner>
      )}

      <p style={{ margin: "0 0 var(--space-3)", color: "var(--text-secondary)" }}>
        <strong style={{ color: "var(--text-primary)" }}>Só a proposta</strong> apaga a varredura —
        páginas lidas e itens propostos — e não toca no acervo. É o que se faz depois de mudar o
        perfil de captura.
        {(preview?.created ?? 0) > 0 && (
          <>
            {" "}
            Aqui ela está indisponível: esta varredura já criou {preview?.created} nós, e sem a
            execução ninguém mais acharia o que ela criou para desfazer.
          </>
        )}
      </p>

      {preview === null && !error ? (
        <p style={{ color: "var(--text-muted)" }}>Contando o que esta varredura criou…</p>
      ) : preview ? (
        <>
          <p style={{ margin: "0 0 var(--space-2)", color: "var(--text-secondary)" }}>
            <strong style={{ color: "var(--text-primary)" }}>A proposta e o acervo</strong> manda
            para a <strong>lixeira</strong> o que esta varredura criou. Dá para restaurar enquanto
            a lixeira não for esvaziada.
          </p>

          {preview.trash.length === 0 ? (
            <Banner tone="info">Esta varredura não criou nada no acervo — não há o que apagar ali.</Banner>
          ) : (
            <p style={{ margin: "0 0 var(--space-3)" }}>
              Vão para a lixeira: <strong>{counts.map(([kind, count]) => plural(kind, count)).join(" · ")}</strong>.
            </p>
          )}

          {preview.keptCount > 0 && (
            <div
              style={{
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-md)",
                padding: "var(--space-3)",
                background: "var(--surface-sunken)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
                <Badge tone="ok">{preview.keptCount} preservados</Badge>
                <span style={{ color: "var(--text-secondary)", fontSize: "var(--text-meta)" }}>
                  editados à mão depois de aprovados — ficam onde estão
                </span>
              </div>
              <ul style={{ margin: 0, paddingLeft: "var(--space-5)", fontSize: "var(--text-body-sm)" }}>
                {preview.keptRows.slice(0, 8).map((row) => (
                  <li key={row.id}>
                    {row.label} <span style={{ color: "var(--text-muted)" }}>· {row.reason}</span>
                  </li>
                ))}
                {preview.keptRows.length > 8 && (
                  <li style={{ color: "var(--text-muted)" }}>e mais {preview.keptRows.length - 8}…</li>
                )}
              </ul>
            </div>
          )}
        </>
      ) : null}
    </Modal>
  );
}
