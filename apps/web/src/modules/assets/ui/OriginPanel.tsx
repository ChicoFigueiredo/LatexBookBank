"use client";

import { useEffect, useState } from "react";

import { Badge, Banner, Button, EmptyState, injectCss } from "@/design-system";
import {
  referenceText,
  type OriginAction,
  type Provenance,
} from "@modules/assets/domain/provenance";
import { describeProvenance } from "@modules/assets/domain/source-anchor";
import { PdfCropViewer } from "@modules/assets/ui/PdfCropViewer";

/**
 * De onde a questão veio — e o caminho de volta.
 *
 * "Voltar à origem" é o aceite da Fase 14, e o que ele exige é concreto: abrir o arquivo na
 * página certa, com o pedaço destacado. A âncora já guardava tudo isso (D28); o que faltava era
 * a porta. Proveniência que não se navega é proveniência que ninguém confere.
 *
 * As ações vêm do servidor, calculadas no domínio: cada uma depende do que a fonte é, e decidir
 * isso aqui daria botões que falham quando clicados.
 *
 * Ver spec §18 · D26 · D28 · issue #137.
 */

const CSS = `
.lbb-origin{display:grid;gap:var(--space-3);padding:var(--space-3)}
.lbb-origin-chain{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-family:var(--font-mono);font-size:var(--text-micro);color:var(--text-secondary)}
.lbb-origin-crop{border:1px solid var(--border-default);border-radius:var(--radius-md);padding:var(--space-2);background:var(--surface-paper);display:grid;place-items:center}
.lbb-origin-actions{display:flex;flex-wrap:wrap;gap:8px}
.lbb-origin-viewer{height:28rem;border:1px solid var(--border-default);border-radius:var(--radius-md);overflow:hidden}
.lbb-origin-text{white-space:pre-wrap;font-family:var(--font-mono);font-size:var(--text-micro);color:var(--text-secondary);margin:0}
`;

export interface OriginPanelProps {
  readonly questionId: string;
  /** Chamado quando a pessoa escolhe uma ação que a tela de fora resolve. */
  readonly onAction?: (action: OriginAction["id"], provenance: Provenance) => void;
}

interface OriginPayload {
  readonly provenance: Provenance | null;
  readonly actions: readonly OriginAction[];
}

export function OriginPanel({ questionId, onAction }: OriginPanelProps) {
  injectCss("lbb-origin-css", CSS);

  // O carregado carrega **de qual questão** é. Sem isso, trocar de questão mostraria a origem da
  // anterior até a resposta nova chegar — e a aba inteira existe para dizer de onde *esta* veio.
  const [loaded, setLoaded] = useState<{ questionId: string; payload: OriginPayload } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Abertos **por âncora**, e não como booleano: trocar de questão fecharia o visualizador de
  // graça, e um `true` herdado abriria a fonte de outra questão sem ninguém ter pedido.
  const [sourceOpenFor, setSourceOpenFor] = useState<string | null>(null);
  const [copiedFrom, setCopiedFrom] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void fetch(`/api/questions/${questionId}/origin`)
      .then(async (response) => {
        const body = (await response.json()) as OriginPayload & { message?: string };
        if (cancelled) return;

        if (!response.ok) setError(body.message ?? "Não deu para ler a origem.");
        else setLoaded({ questionId, payload: body });
      })
      .catch(() => {
        if (!cancelled) setError("Não deu para falar com o servidor.");
      });

    return () => {
      cancelled = true;
    };
  }, [questionId]);

  const payload = loaded?.questionId === questionId ? loaded.payload : null;

  if (error !== null) {
    return (
      <div className="lbb-origin">
        <Banner tone="danger" title="Não deu certo">
          {error}
        </Banner>
      </div>
    );
  }

  if (payload === null) {
    return (
      <div className="lbb-origin">
        <span className="lbb-origin-chain">lendo a origem…</span>
      </div>
    );
  }

  const { provenance, actions } = payload;

  if (provenance === null) {
    return (
      <div className="lbb-origin">
        <EmptyState
          title="Sem origem registrada"
          description="Esta questão foi digitada, não recortada. Questões que vêm de um PDF guardam a página e o pedaço de onde saíram."
        />
      </div>
    );
  }

  const showSource = sourceOpenFor === provenance.anchorId;

  const run = (action: OriginAction) => {
    if (!action.available) return;

    if (action.id === "open-source") {
      setSourceOpenFor(showSource ? null : provenance.anchorId);
      return;
    }
    if (action.id === "copy-reference") {
      void navigator.clipboard?.writeText(referenceText(provenance));
      setCopiedFrom(provenance.anchorId);
      return;
    }
    onAction?.(action.id, provenance);
  };

  return (
    <div className="lbb-origin">
      <p className="lbb-origin-chain">
        <Badge tone="neutral">fonte</Badge>
        {describeProvenance({
          sourceFilename: provenance.source.filename,
          pageNumber: provenance.pageNumber,
          box: provenance.box,
        })}
      </p>

      {provenance.cropAssetId !== null && (
        <div className="lbb-origin-crop">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/assets/${provenance.cropAssetId}/content`}
            alt="Recorte de origem"
            style={{ maxWidth: "100%" }}
          />
        </div>
      )}

      {provenance.extractionModel !== null && (
        <span className="lbb-origin-chain">
          lido por {provenance.extractionModel}
          {provenance.extractionMethod === null ? "" : ` · ${provenance.extractionMethod}`}
        </span>
      )}

      <div className="lbb-origin-actions">
        {actions.map((action) => (
          <Button
            key={action.id}
            size="sm"
            variant={action.id === "open-source" ? "primary" : "ghost"}
            disabled={!action.available}
            // O motivo vai no `title`: botão desabilitado sem explicação é enigma, e o motivo
            // aqui é sempre concreto (fonte que não é PDF, recorte descartado).
            title={action.unavailableReason ?? undefined}
            onClick={() => run(action)}
          >
            {action.id === "open-source" && showSource ? "Fechar a fonte" : action.label}
          </Button>
        ))}
        {copiedFrom === provenance.anchorId && (
          <span className="lbb-origin-chain">referência copiada</span>
        )}
      </div>

      {showSource && (
        <div className="lbb-origin-viewer">
          <PdfCropViewer
            fileUrl={`/api/assets/${provenance.source.assetId}/content`}
            initialPage={provenance.pageNumber}
            highlight={{ pageNumber: provenance.pageNumber, box: provenance.box }}
            // Recortar de novo a partir daqui é outro gesto, e ele pertence à tela de ingestão.
            // O que esta aba faz é mostrar de onde veio.
            onCrop={() => {}}
          />
        </div>
      )}

      {provenance.sourceText !== null && (
        <details>
          <summary className="lbb-origin-chain">texto extraído da fonte</summary>
          <p className="lbb-origin-text">{provenance.sourceText}</p>
        </details>
      )}
    </div>
  );
}
