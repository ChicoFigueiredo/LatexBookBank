"use client";

import { useCallback, useState } from "react";

import { Badge, Banner, Button, Tabs } from "@/design-system";
import type { RenderDiagnostic } from "@latexbookbank/render-contract";

/**
 * O resultado da compilação autoritativa (spec §12).
 *
 * A regra que organiza este arquivo é a do checklist visual §34: **erro de TeX aparece como
 * diagnóstico, não como stack trace cru**. O log completo continua a um clique, na aba "Log",
 * porque toda tradução perde alguma coisa — mas ele não é o que aparece primeiro.
 */

export interface RenderArtifactView {
  readonly name: string;
  readonly kind: "RENDER_PDF" | "RENDER_PNG";
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly width: number | null;
  readonly height: number | null;
}

export interface RenderOutcomeView {
  readonly jobId: string;
  readonly state: string;
  readonly success: boolean;
  readonly cacheHit: boolean;
  readonly durationMs: number;
  readonly diagnostics: readonly RenderDiagnostic[];
  readonly artifacts: readonly RenderArtifactView[];
  readonly stdout?: string;
}

export type RenderStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "running" }
  | { readonly kind: "done"; readonly outcome: RenderOutcomeView }
  /** Worker fora do ar ou não configurado — **não** é erro do documento. */
  | { readonly kind: "unavailable"; readonly message: string }
  | { readonly kind: "error"; readonly message: string };

export interface RenderPanelProps {
  readonly status: RenderStatus;
  readonly onRender: () => void;
  readonly sourceLatex: string;
}

type PanelTab = "pdf" | "png" | "log" | "source";

const TABS = [
  { id: "pdf", label: "PDF" },
  { id: "png", label: "PNG" },
  { id: "log", label: "Log" },
  { id: "source", label: "Fonte" },
] as const;

const artifactUrl = (jobId: string, name: string): string =>
  `/api/render-jobs/${encodeURIComponent(jobId)}/artifacts/${encodeURIComponent(name)}`;

export function RenderPanel({ status, onRender, sourceLatex }: RenderPanelProps) {
  const [tab, setTab] = useState<PanelTab>("pdf");
  const render = useCallback(() => onRender(), [onRender]);

  const outcome = status.kind === "done" ? status.outcome : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          padding: "var(--space-2) var(--space-3)",
          borderBottom: "1px solid var(--border-default)",
        }}
      >
        <Tabs
          tabs={TABS.map((t) => ({ id: t.id, label: t.label }))}
          value={tab}
          onChange={(id) => setTab(id as PanelTab)}
          aria-label="Resultado da compilação"
        />

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <StatusBadge status={status} />
          <Button
            size="sm"
            variant="ghost"
            onClick={render}
            disabled={status.kind === "running"}
            // O atalho no rótulo acessível, não só no título: quem navega por teclado não passa
            // o mouse para descobrir que ele existe.
            aria-keyshortcuts="Control+Enter"
            title="Compilar (Ctrl+Enter)"
          >
            Compilar
          </Button>
        </div>
      </div>

      {status.kind === "unavailable" && (
        <div style={{ padding: "var(--space-3)" }}>
          {/* `warn` e não `danger`: não há nada errado com o documento, e pintar de vermelho
              mandaria a pessoa procurar defeito no texto dela. */}
          <Banner tone="warn" title="Compilação indisponível">
            {status.message}
          </Banner>
        </div>
      )}

      {status.kind === "error" && (
        <div style={{ padding: "var(--space-3)" }}>
          <Banner tone="danger" title="Falha ao compilar">
            {status.message}
          </Banner>
        </div>
      )}

      {outcome !== null && outcome.diagnostics.length > 0 && (
        <div style={{ padding: "var(--space-3) var(--space-3) 0" }}>
          <Diagnostics diagnostics={outcome.diagnostics} />
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "var(--space-3)" }}>
        {tab === "source" ? (
          <SourceView latex={sourceLatex} />
        ) : status.kind === "running" ? (
          // Progresso, não spinner mudo: o critério do §34 é "render mostra progresso", e uma
          // roda girando não diz se travou.
          <p style={{ color: "var(--text-secondary)" }}>Compilando com o TeX…</p>
        ) : outcome === null ? (
          <EmptyHint />
        ) : tab === "pdf" ? (
          <PdfView outcome={outcome} />
        ) : tab === "png" ? (
          <PngView outcome={outcome} />
        ) : (
          <LogView outcome={outcome} />
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { readonly status: RenderStatus }) {
  switch (status.kind) {
    case "running":
      return <Badge tone="info">compilando…</Badge>;
    case "unavailable":
      return <Badge tone="warn">worker fora</Badge>;
    case "error":
      return <Badge tone="danger">erro</Badge>;
    case "done":
      return status.outcome.cacheHit ? (
        // Sem esta marca, um render instantâneo pareceria falha de atualização e a pessoa
        // clicaria de novo achando que não pegou.
        <Badge tone="neutral">cache</Badge>
      ) : (
        <Badge tone={status.outcome.success ? "ok" : "danger"}>
          {status.outcome.success ? `${status.outcome.durationMs} ms` : "falhou"}
        </Badge>
      );
    default:
      return null;
  }
}

function EmptyHint() {
  return (
    <p style={{ color: "var(--text-secondary)" }}>
      Nada compilado ainda. <kbd>Ctrl</kbd>+<kbd>Enter</kbd> gera o PDF autoritativo — o preview
      rápido ao lado é aproximado.
    </p>
  );
}

/**
 * Os diagnósticos, em lista.
 *
 * Erro primeiro, e `info` fica escondido atrás de um contador: `Overfull \hbox` aparece às dezenas
 * em documento saudável, e misturá-lo com os erros faria a lista virar ruído — que é o mesmo que
 * não ter lista.
 */
function Diagnostics({ diagnostics }: { readonly diagnostics: readonly RenderDiagnostic[] }) {
  const errors = diagnostics.filter((d) => d.severity === "error");
  const warnings = diagnostics.filter((d) => d.severity === "warning");
  const infos = diagnostics.length - errors.length - warnings.length;

  return (
    <div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 4 }}>
        {[...errors, ...warnings].map((diagnostic, index) => (
          <li
            key={index}
            style={{
              display: "flex",
              gap: "var(--space-2)",
              fontSize: "var(--text-body-sm)",
              fontFamily: "var(--font-mono)",
            }}
          >
            <span
              style={{
                color: diagnostic.severity === "error" ? "var(--danger)" : "var(--warn)",
                flexShrink: 0,
              }}
            >
              {diagnostic.line === null ? "—" : `L${diagnostic.line}`}
            </span>
            <span style={{ color: "var(--text-primary)" }}>{diagnostic.message}</span>
          </li>
        ))}
      </ul>
      {infos > 0 && (
        <p
          style={{
            margin: "4px 0 0",
            color: "var(--text-secondary)",
            fontSize: "var(--text-micro)",
          }}
        >
          + {infos} aviso(s) de espaçamento, na aba Log.
        </p>
      )}
    </div>
  );
}

function PdfView({ outcome }: { readonly outcome: RenderOutcomeView }) {
  const pdf = outcome.artifacts.find((artifact) => artifact.kind === "RENDER_PDF");
  if (!pdf) return <p style={{ color: "var(--text-secondary)" }}>Esta compilação não gerou PDF.</p>;

  return (
    // `<object>` e não `<iframe>`: o fallback fica dentro do elemento e aparece sozinho onde o
    // navegador não tem leitor de PDF, sem precisar detectar nada.
    <object
      data={artifactUrl(outcome.jobId, pdf.name)}
      type="application/pdf"
      style={{ width: "100%", height: "100%", minHeight: "24rem", border: 0 }}
      aria-label="PDF compilado"
    >
      <a href={artifactUrl(outcome.jobId, pdf.name)}>
        Baixar o PDF ({Math.round(pdf.sizeBytes / 1024)} KB)
      </a>
    </object>
  );
}

function PngView({ outcome }: { readonly outcome: RenderOutcomeView }) {
  const pages = outcome.artifacts.filter((artifact) => artifact.kind === "RENDER_PNG");
  if (pages.length === 0) {
    return <p style={{ color: "var(--text-secondary)" }}>Esta compilação não gerou imagem.</p>;
  }

  return (
    <div style={{ display: "grid", gap: "var(--space-3)" }}>
      {pages.map((page, index) => (
        <figure key={page.name} style={{ margin: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- o artefato vem de rota
              própria com tamanho conhecido; o otimizador do Next não tem o que otimizar aqui. */}
          <img
            src={artifactUrl(outcome.jobId, page.name)}
            alt={`Página ${index + 1} compilada`}
            width={page.width ?? undefined}
            height={page.height ?? undefined}
            style={{
              maxWidth: "100%",
              height: "auto",
              border: "1px solid var(--border-default)",
              // O PNG do `pdftocairo` é transparente onde não há tinta; sem fundo, a página
              // inteira sumiria no tema escuro. `--surface-paper` é branco nos três temas.
              background: "var(--surface-paper)",
            }}
          />
          {pages.length > 1 && (
            <figcaption
              style={{
                color: "var(--text-secondary)",
                fontSize: "var(--text-micro)",
                marginTop: 4,
              }}
            >
              página {index + 1} de {pages.length}
            </figcaption>
          )}
        </figure>
      ))}
    </div>
  );
}

function LogView({ outcome }: { readonly outcome: RenderOutcomeView }) {
  const log = outcome.stdout ?? "";
  if (log.trim() === "") {
    return <p style={{ color: "var(--text-secondary)" }}>Sem log para esta compilação.</p>;
  }
  return <Monospace text={log} />;
}

function SourceView({ latex }: { readonly latex: string }) {
  return (
    <>
      <p
        style={{
          margin: "0 0 var(--space-2)",
          color: "var(--text-secondary)",
          fontSize: "var(--text-micro)",
        }}
      >
        {/* O corpo, não o documento inteiro: o preâmbulo vem do perfil e tem 34 linhas que
            ninguém quer reler a cada compilação. */}
        O corpo enviado ao worker. O preâmbulo vem do perfil.
      </p>
      <Monospace text={latex} />
    </>
  );
}

function Monospace({ text }: { readonly text: string }) {
  return (
    <pre
      style={{
        margin: 0,
        padding: "var(--space-3)",
        background: "var(--surface-sunken)",
        borderRadius: "var(--radius-sm)",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-body-sm)",
        lineHeight: 1.5,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        color: "var(--text-primary)",
      }}
    >
      {text}
    </pre>
  );
}
