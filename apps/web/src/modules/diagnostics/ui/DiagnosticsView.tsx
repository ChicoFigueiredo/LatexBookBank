"use client";

import { useState } from "react";

import { Badge, Banner, Button, injectCss } from "@/design-system";
import type { Diagnostics, Health, SectionStatus } from "@modules/diagnostics/domain/diagnostics";

/**
 * A tela que responde "o que está no ar, e o que não está?".
 *
 * Três estados, não dois. **Não configurado** e **fora do ar** parecem a mesma coisa num
 * indicador binário, e mandam a pessoa procurar em lugares opostos: o primeiro se resolve
 * editando `.env.local`, o segundo subindo um processo.
 *
 * Ver spec §25 · issue #119.
 */

const CSS = `
.lbb-diag{display:grid;gap:var(--space-4);padding:var(--space-6);max-width:64rem;margin:0 auto}
.lbb-diag-card{border:1px solid var(--border-default);border-radius:var(--radius-md);background:var(--surface);overflow:hidden}
.lbb-diag-head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--border-subtle)}
.lbb-diag-title{font-weight:var(--weight-medium)}
.lbb-diag-summary{flex:1;min-width:0;color:var(--text-secondary);font-size:var(--text-body-sm);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lbb-diag-rows{display:grid;grid-template-columns:14rem 1fr;gap:1px;background:var(--border-subtle)}
.lbb-diag-key,.lbb-diag-val{padding:6px 12px;background:var(--surface);font-size:var(--text-body-sm)}
.lbb-diag-key{font-family:var(--font-mono);font-size:var(--text-micro);color:var(--text-secondary)}
.lbb-diag-val{font-family:var(--font-mono);word-break:break-all}
.lbb-diag-actions{display:flex;flex-wrap:wrap;gap:8px;padding:10px 12px;border-top:1px solid var(--border-subtle)}
`;

const TONES: Readonly<Record<Health, "ok" | "danger" | "neutral">> = {
  ok: "ok",
  off: "danger",
  unconfigured: "neutral",
};

const LABELS: Readonly<Record<Health, string>> = {
  ok: "no ar",
  off: "fora do ar",
  unconfigured: "não configurado",
};

export interface DiagnosticsViewProps {
  readonly diagnostics: Diagnostics;
  readonly workspaces: readonly { readonly id: string; readonly name: string }[];
}

export function DiagnosticsView({ diagnostics, workspaces }: DiagnosticsViewProps) {
  injectCss("lbb-diag-css", CSS);

  const [aiTest, setAiTest] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [importReport, setImportReport] = useState<string | null>(null);

  const testAi = async () => {
    setTesting(true);
    setAiTest(null);
    try {
      const response = await fetch("/api/ai/test", { method: "POST" });
      const payload = (await response.json()) as { ok?: boolean; message?: string };
      setAiTest({ ok: payload.ok === true, message: payload.message ?? "Sem resposta." });
    } catch {
      setAiTest({ ok: false, message: "Não deu para falar com o servidor." });
    } finally {
      setTesting(false);
    }
  };

  const importArchive = async (file: File) => {
    setImportReport("lendo…");
    try {
      // Dry-run primeiro, **sempre**: ver o que entraria antes de gravar é o ponto inteiro de ter
      // um formato de intercâmbio em vez de um dump.
      const dry = await fetch("/api/workspaces/import?dryRun=1", {
        method: "POST",
        body: file,
      });
      const preview = (await dry.json()) as {
        wouldCreate?: Record<string, number>;
        collisions?: unknown[];
        message?: string;
      };

      if (!dry.ok) {
        setImportReport(preview.message ?? "Arquivo recusado.");
        return;
      }

      const counts = preview.wouldCreate ?? {};
      const summary =
        `Traria ${counts["publications"] ?? 0} publicação(ões), ` +
        `${counts["questions"] ?? 0} questão(ões) e ${counts["assets"] ?? 0} asset(s).` +
        (preview.collisions?.length ? ` ${preview.collisions.length} colisão(ões).` : "");

      if (!confirm(`${summary}\n\nImportar como um workspace novo?`)) {
        setImportReport(`Cancelado. ${summary}`);
        return;
      }

      const real = await fetch("/api/workspaces/import", { method: "POST", body: file });
      const done = (await real.json()) as { report?: Record<string, number>; message?: string };

      setImportReport(
        real.ok
          ? `Importado: ${done.report?.["questions"] ?? 0} questão(ões) em um workspace novo.`
          : (done.message ?? "Falhou."),
      );
    } catch {
      setImportReport("Não deu para falar com o servidor.");
    }
  };

  return (
    <div className="lbb-diag">
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-title)" }}>
        Diagnóstico
      </h1>

      <Card title="Aplicativo" status={diagnostics.app} />
      <Card title="Banco" status={diagnostics.database} />
      <Card title="Storage" status={diagnostics.storage} />
      <Card title="Render" status={diagnostics.renderer} />

      <Card title="IA" status={diagnostics.ai}>
        {aiTest !== null && (
          <div style={{ padding: "0 12px 10px" }}>
            <Banner tone={aiTest.ok ? "ok" : "danger"} title="Teste de conexão">
              {aiTest.message}
            </Banner>
          </div>
        )}
        <div className="lbb-diag-actions">
          <Button size="sm" variant="secondary" loading={testing} onClick={() => void testAi()}>
            Testar conexão
          </Button>
        </div>
      </Card>

      <Card title="Backup" status={diagnostics.backup} />

      <div className="lbb-diag-card">
        <div className="lbb-diag-head">
          <span className="lbb-diag-title">Portabilidade</span>
          <span className="lbb-diag-summary">
            Exportar leva o acervo inteiro num `.lbb`; importar cria um workspace novo
          </span>
        </div>

        {importReport !== null && (
          <div style={{ padding: "10px 12px 0" }}>
            <Banner tone="info" title="Importação">
              {importReport}
            </Banner>
          </div>
        )}

        <div className="lbb-diag-actions">
          {workspaces.map((workspace) => (
            // `<a download>` e não um botão com `window.location`: baixar um arquivo **é** seguir
            // um link, e o `router` do Next tentaria renderizar a resposta como página. De
            // quebra, o leitor de tela anuncia "link" em vez de "botão", que é o que acontece.
            <a
              key={workspace.id}
              className="lbb-btn"
              data-variant="secondary"
              data-size="sm"
              style={{ textDecoration: "none" }}
              href={`/api/workspaces/export?workspaceId=${workspace.id}`}
              download
            >
              Exportar {workspace.name}
            </a>
          ))}

          <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: "var(--text-body-sm)" }}>Importar `.lbb`</span>
            <input
              type="file"
              accept=".lbb,application/zip"
              aria-label="Arquivo .lbb para importar"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importArchive(file);
              }}
            />
          </label>
        </div>
      </div>
    </div>
  );
}

function Card({
  title,
  status,
  children,
}: {
  readonly title: string;
  readonly status: SectionStatus;
  readonly children?: React.ReactNode;
}) {
  return (
    <div className="lbb-diag-card">
      <div className="lbb-diag-head">
        <span className="lbb-diag-title">{title}</span>
        {/* O estado vai no texto do badge, não só na cor: "fora do ar" e "não configurado" em
            vermelho e cinza seriam indistinguíveis para quem não distingue as duas cores. */}
        <Badge tone={TONES[status.health]}>{LABELS[status.health]}</Badge>
        <span className="lbb-diag-summary">{status.summary}</span>
      </div>

      {status.details.length > 0 && (
        <div className="lbb-diag-rows">
          {status.details.map((detail) => (
            <div key={detail.label} style={{ display: "contents" }}>
              <div className="lbb-diag-key">{detail.label}</div>
              <div className="lbb-diag-val">{detail.value}</div>
            </div>
          ))}
        </div>
      )}

      {children}
    </div>
  );
}
