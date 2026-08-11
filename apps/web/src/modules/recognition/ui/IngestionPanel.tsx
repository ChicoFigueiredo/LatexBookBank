"use client";

import { useState } from "react";

import { Badge, Banner, Button, injectCss, Segmented } from "@/design-system";
import { AssetDropzone } from "@modules/assets/ui/AssetDropzone";
import { PdfCropViewer } from "@modules/assets/ui/PdfCropViewer";
import {
  accept,
  candidateFrom,
  currentLatex,
  describeConfidence,
  edit,
  reject,
  type RecognitionCandidate,
} from "@modules/recognition/domain/recognition-review";
import type { MathRecognitionResult } from "@/shared/ports";

/**
 * A ingestão visual, ponta a ponta: subir → recortar → reconhecer → revisar.
 *
 * **O recorte fica ao lado do candidato até o fim.** É o requisito da Fase 15, e a razão é
 * concreta: um OCR de matemática acerta a maior parte e erra o expoente, e o erro só é visível
 * para quem compara com a imagem. Uma tela que mostrasse o LaTeX sozinho pediria uma revisão que
 * ninguém consegue fazer.
 *
 * Ver spec §10 · §18 · §19 · issue #135.
 */

const CSS = `
.lbb-ing{display:grid;gap:var(--space-4);padding:var(--space-4);min-height:0}
.lbb-ing-viewer{height:32rem;border:1px solid var(--border-default);border-radius:var(--radius-md);overflow:hidden}
.lbb-ing-review{display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);align-items:start}
.lbb-ing-crop{border:1px solid var(--border-default);border-radius:var(--radius-md);padding:var(--space-2);background:var(--surface-paper);display:grid;place-items:center;min-height:8rem}
.lbb-ing-latex{width:100%;min-height:8rem;padding:8px;border:1px solid var(--border-default);border-radius:var(--radius-md);background:var(--surface-raised);color:var(--text-primary);font-family:var(--font-mono);font-size:var(--text-body-sm)}
.lbb-ing-latex:focus-visible{outline:2px solid var(--focus-ring);outline-offset:-1px}
.lbb-ing-meta{font-family:var(--font-mono);font-size:var(--text-micro);color:var(--text-secondary)}
.lbb-ing-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
`;

export interface IngestionPanelProps {
  readonly workspaceId: string;
  readonly publicationId: string;
  readonly questionId?: string | null;
  /** Chamado quando o usuário aceita o LaTeX revisado. */
  readonly onAccept: (latex: string) => void;
}

/** Os quatro do contrato de reconhecimento, com o rótulo que a tela usa. */
type RecognitionMode = "display" | "inline" | "mixed" | "text";

const MODES: readonly { readonly id: RecognitionMode; readonly label: string }[] = [
  { id: "display", label: "Fórmula" },
  { id: "mixed", label: "Texto com fórmula" },
  { id: "text", label: "Só texto" },
];

interface SourceState {
  readonly assetId: string;
  readonly url: string;
  readonly filename: string;
  /** O visualizador precisa saber: PDF abre pelo `pdf.js`, imagem vai direto ao canvas (#185). */
  readonly mimeType: string;
}

export function IngestionPanel({
  workspaceId,
  publicationId,
  questionId = null,
  onAccept,
}: IngestionPanelProps) {
  injectCss("lbb-ing-css", CSS);

  /**
   * O que se espera do recorte.
   *
   * Era `display` fixo, e o acervo é de **provas escaneadas**: a maior parte do que se recorta é
   * enunciado, não fórmula. Pedir fórmula de um parágrafo faz o modelo devolver a única expressão
   * que encontrar — e perder o resto (#193).
   */
  const [mode, setMode] = useState<RecognitionMode>("display");
  const [source, setSource] = useState<SourceState | null>(null);
  const [cropUrl, setCropUrl] = useState<string | null>(null);
  const [cropAssetId, setCropAssetId] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<RecognitionCandidate | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setBusy("subindo");
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("workspaceId", workspaceId);

      const response = await fetch("/api/assets", { method: "POST", body: form });
      const payload = (await response.json()) as { id?: string; message?: string };

      if (!response.ok || payload.id === undefined) {
        setError(payload.message ?? "O arquivo não foi aceito.");
        return;
      }

      // `URL.createObjectURL` e não uma rota de download: o arquivo já está na memória do
      // navegador, e buscá-lo de volta do servidor seria pagar duas vezes pelo mesmo byte.
      setSource({
        assetId: payload.id,
        url: URL.createObjectURL(file),
        filename: file.name,
        // O tipo vem do **arquivo escolhido**, e não do que o servidor devolveu: é o mesmo blob
        // que o `createObjectURL` acabou de publicar, então é ele que o visualizador vai desenhar.
        mimeType: file.type,
      });
      setCandidate(null);
      setCropUrl(null);
    } catch {
      setError("Não deu para falar com o servidor.");
    } finally {
      setBusy(null);
    }
  };

  const saveCrop = async (crop: {
    pageNumber: number;
    box: { x: number; y: number; width: number; height: number };
    png: Blob;
  }) => {
    if (source === null) return;

    setBusy("salvando o recorte");
    setError(null);
    try {
      const form = new FormData();
      form.set("image", crop.png, "crop.png");
      form.set("sourceAssetId", source.assetId);
      form.set("publicationId", publicationId);
      form.set("pageNumber", String(crop.pageNumber));
      for (const [key, value] of Object.entries(crop.box)) form.set(key, String(value));
      if (questionId !== null) form.set("questionId", questionId);

      const response = await fetch("/api/assets/crop", { method: "POST", body: form });
      const payload = (await response.json()) as { cropAssetId?: string; message?: string };

      if (!response.ok || payload.cropAssetId === undefined) {
        setError(payload.message ?? "O recorte não foi salvo.");
        return;
      }

      setCropAssetId(payload.cropAssetId);
      setCropUrl(URL.createObjectURL(crop.png));
      // Reconhecer é o passo seguinte natural, e pedir mais um clique aqui só acrescentaria
      // cerimônia — a revisão continua obrigatória de qualquer forma.
      await recognize(crop.png, payload.cropAssetId);
    } catch {
      setError("Não deu para falar com o servidor.");
    } finally {
      setBusy(null);
    }
  };

  const recognize = async (png: Blob, assetId: string, modo: RecognitionMode = mode) => {
    setBusy("reconhecendo");
    try {
      const form = new FormData();
      form.set("image", png, "crop.png");
      form.set("cropAssetId", assetId);
      form.set("mode", modo);

      const response = await fetch("/api/recognition", { method: "POST", body: form });
      const payload = (await response.json()) as
        (RecognitionCandidate & { message?: string }) | { message?: string };

      if (!response.ok) {
        // Falha do reconhecedor **não perde trabalho**: o recorte já está guardado, e a pessoa
        // pode transcrever à mão ou tentar de novo.
        setError((payload as { message?: string }).message ?? "O reconhecimento falhou.");
        setCandidate(candidateFrom(assetId, emptyResult()));
        return;
      }

      setCandidate(payload as RecognitionCandidate);
    } catch {
      setError("Não deu para falar com o servidor.");
    }
  };

  return (
    <div className="lbb-ing">
      {error !== null && (
        <Banner tone="danger" title="Não deu certo">
          {error}
        </Banner>
      )}

      {source === null ? (
        <AssetDropzone
          onFile={(file) => void upload(file)}
          disabled={busy !== null}
          listenToPaste
          label="Arraste um PDF ou imagem, clique para escolher, ou cole com Ctrl+V"
        />
      ) : (
        <>
          <div className="lbb-ing-actions">
            <Badge tone="neutral">{source.filename}</Badge>
            {busy !== null && <span className="lbb-ing-meta">{busy}…</span>}
            <Button
              size="sm"
              variant="ghost"
              style={{ marginLeft: "auto" }}
              onClick={() => {
                setSource(null);
                setCandidate(null);
                setCropUrl(null);
              }}
            >
              Trocar arquivo
            </Button>
          </div>

          {/* A escolha vem **antes** do recorte, e não depois: ela muda o que se pede ao modelo, e
              descobrir a opção só ao ver o resultado errado custa uma rodada do modelo de visão. */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ color: "var(--text-secondary)", fontSize: "var(--text-body-sm)" }}>
              O recorte é:
            </span>
            <Segmented
              options={MODES.map((entry) => ({ id: entry.id, label: entry.label }))}
              value={mode}
              onChange={(value) => setMode(value as RecognitionMode)}
              aria-label="O que se espera do recorte"
            />
          </div>

          <div className="lbb-ing-viewer">
            <PdfCropViewer
              fileUrl={source.url}
              mimeType={source.mimeType}
              onCrop={(crop) => void saveCrop(crop)}
            />
          </div>
        </>
      )}

      {candidate !== null && cropUrl !== null && (
        <div className="lbb-ing-review">
          <div>
            <span className="lbb-ing-meta">o recorte</span>
            <div className="lbb-ing-crop">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cropUrl} alt="Recorte da página" style={{ maxWidth: "100%" }} />
            </div>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <span className="lbb-ing-meta">
              o que o modelo leu · {describeConfidence(candidate.result.confidence)}
            </span>
            <textarea
              className="lbb-ing-latex"
              aria-label="LaTeX reconhecido"
              value={currentLatex(candidate)}
              onChange={(event) => setCandidate(edit(candidate, event.target.value))}
            />
            <span className="lbb-ing-meta">
              {candidate.result.model} · {candidate.result.durationMs} ms · {candidate.state}
            </span>

            <div className="lbb-ing-actions">
              <Button
                size="sm"
                variant="primary"
                disabled={currentLatex(candidate).trim() === ""}
                onClick={() => {
                  // O clique **é** o gesto de revisão que a Fase 15 exige. `accept` recusa um
                  // candidato que ninguém tocou nem conferiu.
                  const reviewed = accept(candidate, true);
                  setCandidate(reviewed);
                  onAccept(currentLatex(reviewed));
                }}
              >
                Conferi — usar este LaTeX
              </Button>

              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  // Rejeitar não apaga o recorte: ele é fonte, e a próxima tentativa parte dele.
                  setCandidate(reject(candidate));
                  if (cropAssetId !== null && cropUrl !== null) {
                    void fetch(cropUrl)
                      .then((response) => response.blob())
                      .then((png) => recognize(png, cropAssetId));
                  }
                }}
              >
                Tentar de novo
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Um candidato vazio, para a falha do provider virar campo editável em vez de tela morta. */
const emptyResult = (): MathRecognitionResult => ({
  latex: "",
  confidence: null,
  alternatives: [],
  providerId: "—",
  model: "—",
  durationMs: 0,
});
