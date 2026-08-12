"use client";

import { useState } from "react";

import { Badge, Banner, Button, Icon, injectCss, Segmented } from "@/design-system";
import { AssetDropzone } from "@modules/assets/ui/AssetDropzone";
import { PdfCropViewer } from "@modules/assets/ui/PdfCropViewer";
import { optionLabelAt } from "@modules/questions/domain/question-type";
import {
  detectarBlocoUnido,
  separarAlternativas,
  type AlternativaLida,
} from "@modules/recognition/domain/separar-alternativas";
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
.lbb-ing-split{display:flex;flex-direction:column;gap:5px;padding:var(--space-3);border:1px solid var(--border-subtle);border-radius:var(--radius-md);background:var(--surface-raised)}
.lbb-ing-alt{display:flex;align-items:center;gap:9px;font-size:var(--text-body-sm);color:var(--text-primary)}
/* O bloco unido é aviso, não erro: o texto está todo lá, só precisa de um corte. */
.lbb-ing-alt[data-tone="warn"]{padding:6px 8px;border:1px solid var(--warn-border);border-radius:var(--radius-sm);background:var(--warn-surface)}
.lbb-ing-alt-label{flex-shrink:0;font-family:var(--font-mono);font-size:var(--text-meta);color:var(--text-muted);white-space:nowrap}
/* O rótulo derivado, quando difere do livro: a mudança fica à vista em vez de acontecer calada. */
.lbb-ing-alt-derivada{color:var(--warn-text)}
.lbb-ing-progress{display:flex;flex-direction:column;gap:6px;padding:var(--space-3) var(--space-4);border:1px solid var(--border-subtle);border-radius:var(--radius-md);background:var(--surface-raised)}
.lbb-ing-step{display:flex;align-items:center;gap:8px;font-size:var(--text-body-sm);color:var(--text-primary)}
/* O que já aconteceu fica verde; o que está acontecendo fica em texto normal. */
.lbb-ing-step[data-done="true"]{color:var(--ok-text)}
.lbb-ing-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
`;

/**
 * O que sai daqui quando alguém confere e aceita.
 *
 * Não é mais só o LaTeX. O `anchorId` é o que liga a questão à página de onde ela saiu, e a
 * execução do reconhecedor é o que a §69 pede preservar — sem eles, a questão criada a partir de
 * um recorte nasceria sem origem, e "de onde veio isto?" ficaria sem resposta seis meses depois.
 */
export interface AcceptedRecognition {
  readonly anchorId: string;
  readonly cropAssetId: string;
  readonly statementLatex: string;
  /**
   * As alternativas separadas do enunciado, quando o recorte era uma questão inteira.
   *
   * `RecognitionCandidate` tem `options` e `createQuestionFromRecognition` sabe gravá-las desde
   * sempre — **nada no app jamais as preencheu**. A ponta receptora estava pronta e ninguém
   * alimentava, e é o que o handoff do protótipo listou como "faltava Questão completa".
   */
  readonly options: readonly { readonly label: string; readonly statementLatex: string }[];
  readonly run: {
    readonly providerId: string;
    readonly model: string;
    readonly durationMs: number;
    readonly confidence: number | null;
    readonly mode: string;
    /** O LaTeX **como veio do modelo**, antes da correção humana. */
    readonly rawLatex: string;
  };
}

export interface IngestionPanelProps {
  readonly workspaceId: string;
  readonly publicationId: string;
  readonly questionId?: string | null;
  /** Chamado quando o usuário confere e aceita o candidato. */
  readonly onAccept: (accepted: AcceptedRecognition) => void;
}

/** Aplica as divisões aceitas até nenhuma mais casar. Ver o comentário no consumidor. */
function aplicarDivisoes(
  options: readonly AlternativaLida[],
  divididos: ReadonlyMap<string, readonly AlternativaLida[]>,
): readonly AlternativaLida[] {
  let atual = options;

  for (let passada = 0; passada < 5; passada += 1) {
    const proxima = atual.flatMap((opcao) => divididos.get(opcao.statementLatex) ?? [opcao]);
    if (proxima.length === atual.length) return proxima;
    atual = proxima;
  }

  return atual;
}

/** Os quatro do contrato de reconhecimento, com o rótulo que a tela usa. */
type RecognitionMode = "questao" | "display" | "inline" | "mixed" | "text";

/**
 * O que se pede ao modelo — e o quarto é o que faltava.
 *
 * Os três primeiros são **técnicos**: descrevem o formato do recorte. O handoff do protótipo os
 * chama assim, e aponta a lacuna: quem recorta uma questão de prova não está pensando em "texto
 * com fórmula", está pensando em "esta questão". `Questão completa` lê o recorte como os outros e
 * **separa enunciado de alternativas** — a diferença não está no modelo, está no que se faz com o
 * que ele devolveu.
 */
const MODES: readonly { readonly id: RecognitionMode; readonly label: string }[] = [
  { id: "questao", label: "Questão completa" },
  { id: "display", label: "Fórmula" },
  { id: "mixed", label: "Texto com fórmula" },
  { id: "text", label: "Só texto" },
];

/** `questao` não existe no provider: ele lê como `mixed`, e a separação é nossa, aqui. */
const MODO_DO_PROVIDER = (modo: RecognitionMode): string => (modo === "questao" ? "mixed" : modo);

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
  // A âncora é o dado; o crop é a imagem dela. Guardá-la aqui é o que permite criar a questão com
  // origem — antes, a resposta do `/api/assets/crop` trazia o `anchorId` e a tela o descartava.
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<RecognitionCandidate | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /**
   * O que já aconteceu enquanto o modelo lê (protótipo, 1590–1614).
   *
   * A tela dizia `reconhecendo…` — uma palavra num canto — durante a única espera do produto em
   * que o usuário tem uma pergunta concreta: *"se isto falhar, perco meu recorte?"*. A resposta é
   * **não**, está no código (`cropAssetId` é criado antes de o modelo ser chamado) e até no
   * comentário do `catch` — e nunca chegava a quem esperava.
   *
   * Nenhum dos passos é decorativo: os dois primeiros são fatos já consumados no momento em que
   * aparecem, e é o que os torna uma garantia em vez de uma barra de progresso fingida.
   */
  const [progresso, setProgresso] = useState<readonly string[]>([]);
  /**
   * As divisões que a pessoa aceitou — por texto do bloco, não por índice.
   *
   * O índice muda quando uma divisão acontece antes dele na lista; o texto do bloco é o que
   * identifica *aquele* bloco. Guardar por índice faria a segunda divisão apagar a primeira.
   */
  const [divididos, setDivididos] = useState<ReadonlyMap<string, readonly AlternativaLida[]>>(
    new Map(),
  );
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
      const payload = (await response.json()) as {
        cropAssetId?: string;
        anchorId?: string;
        message?: string;
      };

      if (!response.ok || payload.cropAssetId === undefined || payload.anchorId === undefined) {
        setError(payload.message ?? "O recorte não foi salvo.");
        return;
      }

      setCropAssetId(payload.cropAssetId);
      setAnchorId(payload.anchorId);
      setCropUrl(URL.createObjectURL(crop.png));
      // Reconhecer é o passo seguinte natural, e pedir mais um clique aqui só acrescentaria
      // cerimônia — a revisão continua obrigatória de qualquer forma.
      //
      // A âncora vai **explícita**: `setAnchorId` acabou de ser chamado e o estado ainda não
      // chegou nesta closure. Ler o estado aqui mandaria `null` e o servidor não guardaria nada.
      // O recorte já está guardado neste ponto — e é isso que a lista vai dizer, no momento em
      // que passa a ser verdade e não antes.
      setProgresso(["recorte guardado como evidência"]);
      await recognize(crop.png, payload.cropAssetId, mode, payload.anchorId);
    } catch {
      setError("Não deu para falar com o servidor.");
    } finally {
      setBusy(null);
    }
  };

  const recognize = async (
    png: Blob,
    assetId: string,
    modo: RecognitionMode = mode,
    anchor: string | null = anchorId,
  ) => {
    setBusy("reconhecendo");
    setProgresso((atual) => [...atual, "lendo texto e matemática"]);
    try {
      const form = new FormData();
      form.set("image", png, "crop.png");
      form.set("cropAssetId", assetId);
      form.set("mode", MODO_DO_PROVIDER(modo));
      // A âncora vai junto para o servidor **guardar** o que o modelo leu. É o que faz reconhecer
      // dez recortes e fechar a aba não perder as dez transcrições (§26).
      if (anchor !== null) form.set("anchorId", anchor);

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
    } finally {
      setProgresso([]);
      // Recorte novo, divisões novas: uma divisão aceita para o bloco anterior não vale para este,
      // e o mapa por texto casaria por acaso se dois recortes tivessem a mesma alternativa.
      setDivididos(new Map());
    }
  };

  /**
   * A separação é derivada do texto **revisado**, e recalculada a cada tecla.
   *
   * Não guardada em estado: corrigir o LaTeX e ver as alternativas continuarem as antigas seria a
   * tela mostrando uma coisa e gravando outra. Só vale no modo `Questão completa` — nos outros o
   * recorte não é uma questão inteira, e separar seria inventar estrutura em cima de uma fórmula.
   */
  const bruto =
    candidate !== null && mode === "questao"
      ? separarAlternativas(currentLatex(candidate))
      : null;

  /**
   * As alternativas com as divisões já aceitas — e aplicadas **até estabilizar**.
   *
   * Uma passada só não basta, e o e2e pegou: cortar `b)` em `b` + `c` deixa o `d)` dentro do novo
   * `c`, e a divisão seguinte é sobre um texto que **não existia** na lista original. Aplicar uma
   * vez casava só o primeiro corte; do segundo em diante o clique não fazia nada.
   *
   * O teto existe porque o mapa é dado de entrada da própria função: uma divisão cujo resultado
   * contivesse a chave dela mesma laçaria para sempre. Cinco é folgado — uma questão tem cinco
   * alternativas, e cada corte resolve uma.
   */
  const separado = bruto ? { ...bruto, options: aplicarDivisoes(bruto.options, divididos) } : null;

  const unidos = separado ? detectarBlocoUnido(separado.options) : [];

  return (
    <div className="lbb-ing">
      {error !== null && (
        <Banner tone="danger" title="Não deu certo">
          {error}
        </Banner>
      )}

      {busy !== null && progresso.length > 0 && (
        <div className="lbb-ing-progress" role="status">
          {progresso.map((passo, indice) => (
            <div key={passo} className="lbb-ing-step" data-done={indice < progresso.length - 1}>
              <Icon name={indice < progresso.length - 1 ? "check" : "scan-text"} size={13} />
              {passo}
              {indice === progresso.length - 1 && "…"}
            </div>
          ))}
          {/*
            A frase que responde a pergunta de quem espera, e é literalmente verdade: o
            `cropAssetId` nasce antes da chamada ao modelo, e o `catch` devolve um candidato vazio
            justamente para a transcrição à mão continuar possível. Dizer isso durante a espera é
            mais barato que descobrir depois — e é a diferença entre esperar e torcer.
          */}
          <span className="lbb-ing-meta">
            se o reconhecimento falhar, o recorte fica — dá para transcrever à mão
          </span>
        </div>
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

            {/*
              O que vai ser gravado, **antes** de gravar.

              É o princípio deste módulo aplicado a um passo novo: nenhum caminho leva de "o modelo
              leu" a "está no acervo" sem um humano ver. Preencher `options` em silêncio criaria
              cinco alternativas que ninguém conferiu, e a diferença entre quatro e cinco só
              apareceria na prova impressa.
            */}
            {separado !== null && (
              <div className="lbb-ing-split" role="status">
                {separado.options.length === 0 ? (
                  <span className="lbb-ing-meta">
                    Nenhum bloco de alternativas reconhecido — isto entra como enunciado inteiro.
                    Um rótulo solto ou fora de ordem não vira alternativa de propósito.
                  </span>
                ) : (
                  <>
                    <span className="lbb-ing-meta">
                      {separado.options.length} alternativas separadas do enunciado · nenhuma nasce
                      marcada como correta — o gabarito é seu, no editor
                    </span>
                    {separado.options.map((opcao, indice) => {
                      const unido = unidos.find((bloco) => bloco.indice === indice);

                      return (
                        <div
                          key={`${opcao.label}-${indice}`}
                          className="lbb-ing-alt"
                          data-tone={unido ? "warn" : undefined}
                        >
                          {/*
                            O rótulo do livro e, quando difere, o que vai ser gravado.

                            O app deriva a letra da **posição** em todo lugar (`optionLabelAt`), e
                            é a decisão certa: é o que faz o gabarito acompanhar a alternativa
                            quando ela é movida, em vez de seguir a letra. Mas um livro que escreve
                            `A) B)` ou `i) ii)` vira `a) b)` ao gravar — e mostrar só o rótulo do
                            livro aqui faria a pessoa conferir uma coisa e receber outra, sem nunca
                            ver a troca acontecer.

                            Os dois lado a lado transformam a mudança silenciosa numa mudança
                            visível. Iguais, o segundo não aparece.
                          */}
                          <span className="lbb-ing-alt-label">
                            {opcao.label}
                            {opcao.label !== optionLabelAt(indice) && (
                              <span className="lbb-ing-alt-derivada">
                                {" → "}
                                {optionLabelAt(indice)}
                              </span>
                            )}
                          </span>
                          <span style={{ flex: 1 }}>{opcao.statementLatex}</span>

                          {/*
                            O bloco unido é **sinalizado**, e não dividido sozinho (protótipo,
                            1702–1712). O OCR de página em duas colunas cola `b) … c) …` na mesma
                            linha com frequência, e a regra que protege o enunciado — âncora no
                            início da linha — é justamente a que produz o bloco. Dividir por conta
                            própria criaria uma alternativa a partir de um `c)` que talvez seja
                            parte do texto: perguntar custa um clique, errar custa uma prova
                            impressa com a alternativa errada.
                          */}
                          {unido && (
                            <>
                              <span className="lbb-ing-meta" style={{ color: "var(--warn-text)" }}>
                                duas alternativas em um bloco
                              </span>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() =>
                                  setDivididos((atual) => {
                                    const proximo = new Map(atual);
                                    proximo.set(opcao.statementLatex, unido.partes);
                                    return proximo;
                                  })
                                }
                              >
                                Dividir em duas
                              </Button>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}

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

                  if (anchorId === null) {
                    setError("O recorte perdeu a âncora — recorte de novo antes de aceitar.");
                    return;
                  }

                  /*
                    O que está **na tela**, e não um recálculo.

                    A primeira versão chamava `separarAlternativas` de novo aqui, e o resultado
                    ignorava as divisões que a pessoa tinha acabado de aceitar: a tela mostrava
                    quatro alternativas e o banco recebia duas. É o defeito que o comentário do
                    `separado` alerta duas telas acima, cometido na linha seguinte.
                  */
                  const partido = separado;

                  onAccept({
                    anchorId,
                    cropAssetId: reviewed.cropAssetId,
                    // O enunciado **sem** as alternativas quando elas foram separadas: deixá-las
                    // nos dois lugares criaria a questão com o bloco de opções repetido dentro do
                    // próprio enunciado.
                    statementLatex: partido?.options.length
                      ? partido.statementLatex
                      : currentLatex(reviewed),
                    options: partido?.options ?? [],
                    run: {
                      providerId: reviewed.result.providerId,
                      model: reviewed.result.model,
                      durationMs: reviewed.result.durationMs,
                      confidence: reviewed.result.confidence,
                      mode,
                      rawLatex: reviewed.result.latex,
                    },
                  });
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
