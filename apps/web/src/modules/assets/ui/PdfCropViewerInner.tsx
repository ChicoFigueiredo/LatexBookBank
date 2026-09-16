"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button, injectCss } from "@/design-system";
import {
  clampToPage,
  CURSORS,
  escalaParaCaber,
  handleAt,
  isUsable,
  rectFromDrag,
  resize,
  type Handle,
  type Point,
} from "@modules/assets/domain/crop-interaction";
import { normalizedBoxFrom, type PixelRect } from "@modules/assets/domain/source-anchor";
import { lerCamadaDeTexto } from "@modules/assets/ui/pdf-text-layer";
import {
  segmentarPagina,
  type QuestaoEstimada,
} from "@modules/recognition/domain/segmentar-pagina";

/**
 * O visualizador de PDF com recorte.
 *
 * As regras — arrastar, redimensionar, prender à página — moram em `crop-interaction.ts` e são
 * testadas lá. Aqui fica só o que precisa de canvas: rasterizar a página e recortar o que está na
 * tela.
 *
 * **O recorte é feito no cliente de propósito.** A página já foi rasterizada para ser mostrada, e
 * recortá-la custa uma chamada de `drawImage` — rasterizar de novo no servidor custaria um
 * processo por recorte, para produzir a mesma imagem que a pessoa está vendo.
 *
 * O que sobe é a **caixa normalizada** mais o PNG (D28). A imagem é conveniência; a âncora é o
 * dado, e é ela que sobrevive a uma mudança de zoom, de DPI ou de ferramenta.
 *
 * Ver spec §18 · D28 · issue #133.
 */

const CSS = `
/* \`height:100%\` é o que faz a página **rolar**, e a falta dele era um bug de verdade: sem altura
   herdada do contêiner, o \`flex:1\` do palco não tinha o que dividir, o palco crescia junto com o
   canvas e o \`overflow:hidden\` de quem hospeda (ingestão e origem, ambos de altura fixa) cortava o
   resto da página em silêncio — sem barra de rolagem, sem como chegar na questão de baixo.
   Achado no dogfooding da prova ProfMat, 2026-09-02. */
.lbb-pdf{display:flex;flex-direction:column;gap:var(--space-2);min-height:0;height:100%}
.lbb-pdf-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:6px 8px;border-bottom:1px solid var(--border-subtle)}
.lbb-pdf-info{font-family:var(--font-mono);font-size:var(--text-micro);color:var(--text-secondary)}
.lbb-pdf-stage{position:relative;overflow:auto;flex:1;min-height:0;background:var(--surface-sunken);display:flex;justify-content:center;padding:var(--space-3)}
.lbb-pdf-holder{position:relative;line-height:0}
.lbb-pdf-canvas{box-shadow:var(--shadow-md);background:white}
.lbb-pdf-rect{position:absolute;border:2px solid var(--accent);background:color-mix(in srgb, var(--accent) 12%, transparent);pointer-events:none}
.lbb-pdf-handle{position:absolute;width:10px;height:10px;background:var(--surface);border:2px solid var(--accent);border-radius:2px;pointer-events:none}
.lbb-pdf-origin{position:absolute;border:2px dashed var(--warn);background:color-mix(in srgb, var(--warn) 10%, transparent);pointer-events:none}
.lbb-pdf-estimada{position:absolute;border:2px solid var(--info);background:color-mix(in srgb, var(--info) 8%, transparent);pointer-events:none}
.lbb-pdf-estimada-numero{position:absolute;top:2px;left:2px;padding:1px 5px;border-radius:2px;background:var(--info-surface);color:var(--info-text);border:1px solid var(--info-border);font-family:var(--font-mono);font-size:var(--text-micro);line-height:1.4}
`;

export interface PdfCropViewerInnerProps {
  readonly fileUrl: string;
  /**
   * O tipo do arquivo.
   *
   * A tela de ingestão promete "um PDF **ou imagem**", e até a #185 o visualizador mandava tudo
   * para o `pdf.js`: subir um PNG dava "Não deu para abrir o PDF: Invalid PDF structure" — uma
   * mensagem correta sobre a pergunta errada.
   *
   * Uma imagem é um documento de **uma página só**, e o resto do mecanismo não muda: o recorte
   * opera sobre o canvas, e o canvas não sabe de onde veio o desenho.
   */
  readonly mimeType?: string;
  /** Chamado ao salvar: caixa normalizada, página e os bytes do recorte. */
  readonly onCrop: (crop: {
    pageNumber: number;
    box: { x: number; y: number; width: number; height: number };
    png: Blob;
  }) => void;
  readonly initialScale?: number;
  /** Página inicial — é assim que "voltar à origem" abre no lugar certo. */
  readonly initialPage?: number;
  /**
   * Uma caixa **normalizada** a destacar, desenhada por cima da página.
   *
   * Normalizada e não em pixels porque é a âncora guardada (D28) que chega aqui: o zoom é escolha
   * de quem está olhando, e converter no servidor amarraria o destaque a um DPI.
   */
  readonly highlight?: {
    readonly pageNumber: number;
    readonly box: { x: number; y: number; width: number; height: number };
  } | null;
  /**
   * Habilita o botão "Estimar questões" na barra — só aparece com isto presente **e** documento
   * PDF (imagem não tem camada de texto para ler). Quem decide o que fazer com o resultado é a
   * tela de cima: o visualizador só lê a página e devolve.
   */
  readonly onEstimar?: (estimadas: readonly QuestaoEstimada[]) => void;
  /**
   * As caixas propostas a desenhar sobre a página atual — mesmo esquema do `highlight`, mas sem
   * interação: aceitar, ajustar ou descartar uma proposta é gesto de outra tela, ainda por vir.
   */
  readonly estimadas?: readonly QuestaoEstimada[];
  /**
   * Recortar de uma vez todas as caixas propostas.
   *
   * Vive aqui, e não na tela de cima, porque **o canvas está aqui**: a página já foi rasterizada
   * para ser mostrada, e cada recorte é um `drawImage` sobre ela. Pedir isto de fora significaria
   * exportar o canvas ou rasterizar de novo no servidor — a mesma imagem, dezenas de vezes.
   */
  readonly onCropLote?: (
    recortes: readonly {
      readonly numero: number | null;
      readonly pageNumber: number;
      readonly box: { x: number; y: number; width: number; height: number };
      readonly png: Blob;
    }[],
  ) => void;
  /**
   * O documento não abriu — e quem hospeda precisa saber.
   *
   * O visualizador já dizia isso **dentro dele**, o que basta para um arquivo que a pessoa acabou
   * de escolher: ela vê o motivo e troca. Não basta quando o arquivo foi aberto sozinho (a fonte
   * do livro, na captura): aí a tela inteira é um visualizador com uma frase de erro, e quem
   * chegou não pediu por aquele arquivo nem sabe como sair dele. Avisar para fora é o que permite
   * cair para a área de arrastar em vez de deixar a pessoa num beco.
   */
  readonly onLoadError?: (motivo: string) => void;
}

export default function PdfCropViewerInner({
  fileUrl,
  mimeType = "application/pdf",
  onCrop,
  initialScale = 1.2,
  initialPage = 1,
  highlight = null,
  onEstimar,
  estimadas,
  onCropLote,
  onLoadError,
}: PdfCropViewerInnerProps) {
  injectCss("lbb-pdf-css", CSS);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const docRef = useRef<{ numPages: number; getPage: (n: number) => Promise<unknown> } | null>(
    null,
  );

  const [pageNumber, setPageNumber] = useState(initialPage);
  const [pdfPageCount, setPdfPageCount] = useState(0);
  const [scale, setScale] = useState(initialScale);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [rect, setRect] = useState<PixelRect | null>(null);
  const [hover, setHover] = useState<Handle | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Guarda contra clique duplo enquanto a página e o domínio ainda estão sendo consultados.
  const [estimando, setEstimando] = useState(false);

  const drag = useRef<{ handle: Handle | "new"; origin: Point; base: PixelRect | null } | null>(
    null,
  );

  /**
   * O aviso de falha por `ref`, e não pelas dependências do efeito.
   *
   * Ele é chamado de dentro do efeito que abre o documento. Pô-lo nas dependências faria uma
   * função nova a cada render **reabrir o PDF** — e um PDF que não abre reabriria em laço.
   */
  const avisarFalha = useRef(onLoadError);
  useEffect(() => {
    avisarFalha.current = onLoadError;
  }, [onLoadError]);

  /** Imagem é documento de uma página. O recorte não muda: ele opera sobre o canvas. */
  const isImage = mimeType.startsWith("image/");

  /**
   * Quantas páginas há — **derivado**, não guardado.
   *
   * Para PDF vem do `pdf.js`; para imagem é sempre uma. Guardar num estado exigiria escrevê-lo de
   * dentro do efeito, e o React Compiler recusa `setState` síncrono ali. Ele tem razão: isto não é
   * um estado, é uma consequência do tipo do arquivo.
   */
  const pages = isImage ? 1 : pdfPageCount;

  useEffect(() => {
    // Nada a abrir quando é imagem: ela é desenhada direto no canvas pelo efeito de render, e a
    // contagem de páginas é **derivada** logo abaixo. Marcar o estado aqui seria `setState`
    // síncrono dentro de efeito, que o React Compiler recusa — com razão: o valor não é um estado,
    // é uma consequência do tipo do arquivo.
    if (isImage) return;

    let cancelled = false;

    void (async () => {
      try {
        // Import dinâmico: `pdfjs-dist` toca `window` ao carregar, e o worker precisa de uma URL
        // que só existe no navegador.
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        // `{ url }` e não a string direta: esta versão do `pdfjs-dist` só aceita o objeto de
        // parâmetros, e a forma antiga falha em tempo de tipo.
        const doc = await pdfjs.getDocument({ url: fileUrl }).promise;
        if (cancelled) return;

        docRef.current = doc as unknown as typeof docRef.current;
        setPdfPageCount(doc.numPages);
      } catch (problem) {
        if (cancelled) return;
        const motivo = problem instanceof Error ? problem.message : "PDF não abriu.";
        setError(motivo);
        avisarFalha.current?.(motivo);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fileUrl, isImage]);

  useEffect(() => {
    const doc = docRef.current;
    const canvas = canvasRef.current;
    if (canvas === null || pages === 0) return;
    if (!isImage && doc === null) return;

    let cancelled = false;

    void (async () => {
      if (isImage) {
        const bitmap = await new Promise<HTMLImageElement | null>((resolve) => {
          const image = new Image();
          image.onload = () => resolve(image);
          // Erro aqui é arquivo corrompido ou tipo que o navegador não desenha. Dizer isso é
          // melhor que um canvas em branco que parece ter carregado.
          image.onerror = () => resolve(null);
          image.src = fileUrl;
        });

        if (cancelled) return;
        if (bitmap === null) {
          setError("A imagem não abriu.");
          avisarFalha.current?.("A imagem não abriu.");
          return;
        }

        // A mesma escala do PDF: é o zoom da barra, e o recorte é normalizado sobre o tamanho
        // desenhado — então mudar o zoom não muda a caixa que se grava (D28).
        canvas.width = Math.floor(bitmap.naturalWidth * scale);
        canvas.height = Math.floor(bitmap.naturalHeight * scale);
        setSize({ width: canvas.width, height: canvas.height });

        const context = canvas.getContext("2d");
        if (context === null) return;

        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        return;
      }

      const page = (await doc!.getPage(pageNumber)) as {
        getViewport: (options: { scale: number }) => { width: number; height: number };
        render: (options: unknown) => { promise: Promise<void> };
      };

      const viewport = page.getViewport({ scale });
      if (cancelled) return;

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      setSize({ width: canvas.width, height: canvas.height });

      const context = canvas.getContext("2d");
      if (context === null) return;

      await page.render({ canvasContext: context, viewport, canvas }).promise;
    })();

    return () => {
      cancelled = true;
    };
    // `pages` entra para o primeiro render acontecer assim que o documento abre.
  }, [pageNumber, scale, pages, isImage, fileUrl]);

  /**
   * Recortar todas as caixas propostas, na ordem em que aparecem na página.
   *
   * Cada `toBlob` é assíncrono, e é por isso que a espera é explícita: entregar a lista pela metade
   * faria a tela de cima gravar menos recortes do que mostrou, sem dizer nada. Caixa que não vira
   * PNG (canvas sem contexto, blob nulo) simplesmente não entra — e a contagem que chega do outro
   * lado é a verdade sobre o que existe, não sobre o que se pediu.
   */
  const recortarEstimadas = async () => {
    const canvas = canvasRef.current;
    if (canvas === null || estimadas === undefined || onCropLote === undefined) return;

    const recortes: {
      numero: number | null;
      pageNumber: number;
      box: { x: number; y: number; width: number; height: number };
      png: Blob;
    }[] = [];

    for (const estimada of estimadas) {
      const px = {
        x: estimada.box.x * size.width,
        y: estimada.box.y * size.height,
        width: estimada.box.width * size.width,
        height: estimada.box.height * size.height,
      };
      if (!isUsable(px)) continue;

      const cut = document.createElement("canvas");
      cut.width = Math.round(px.width);
      cut.height = Math.round(px.height);
      const context = cut.getContext("2d");
      if (context === null) continue;

      context.drawImage(
        canvas,
        Math.round(px.x),
        Math.round(px.y),
        cut.width,
        cut.height,
        0,
        0,
        cut.width,
        cut.height,
      );

      const png = await new Promise<Blob | null>((resolve) => cut.toBlob(resolve, "image/png"));
      if (png === null) continue;

      // A caixa que sobe é a **proposta**, já normalizada pelo domínio — e não uma reconversão da
      // versão em pixels, que só acrescentaria erro de arredondamento ao mesmo número.
      recortes.push({ numero: estimada.numero, pageNumber, box: estimada.box, png });
    }

    onCropLote(recortes);
  };

  /**
   * Medir o palco e aplicar a escala que a conta do domínio devolver.
   *
   * O tamanho natural sai de `size / scale`: `size` é o que já foi desenhado, e dividir pela escala
   * atual devolve a página em 100% — sem guardar outro estado que pudesse divergir do canvas.
   */
  const ajustar = useCallback(
    (modo: "largura" | "pagina") => {
      const stage = stageRef.current;
      if (stage === null || scale <= 0) return;

      const alvo = escalaParaCaber(
        { width: size.width / scale, height: size.height / scale },
        { width: stage.clientWidth, height: stage.clientHeight },
        modo,
      );
      if (alvo !== null) setScale(alvo);
    },
    [scale, size],
  );

  const pointFrom = useCallback((event: React.MouseEvent): Point => {
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }, []);

  const onMouseDown = (event: React.MouseEvent) => {
    const point = pointFrom(event);
    const handle = rect === null ? null : handleAt(point, rect);

    drag.current =
      handle === null
        ? { handle: "new", origin: point, base: null }
        : { handle, origin: point, base: rect };

    if (handle === null) setRect(clampToPage({ ...point, width: 0, height: 0 }, size));
  };

  const onMouseMove = (event: React.MouseEvent) => {
    const current = drag.current;

    // O cursor segue a alça sob o ponteiro **mesmo sem arrastar** — é o que diz à pessoa que o
    // canto é pegável antes de ela tentar. A primeira versão consultava um ponto fixo e o cursor
    // nunca mudava.
    if (current === null) {
      setHover(rect === null ? null : handleAt(pointFrom(event), rect));
      return;
    }

    const point = pointFrom(event);
    if (rect !== null) setHover(handleAt(point, rect));

    if (current.handle === "new") {
      setRect(rectFromDrag(current.origin, point, size));
      return;
    }
    if (current.base === null) return;

    setRect(
      resize(
        current.base,
        current.handle,
        { x: point.x - current.origin.x, y: point.y - current.origin.y },
        size,
      ),
    );
  };

  const endDrag = () => {
    drag.current = null;
    // Desenho pequeno demais é clique, não recorte — e um retângulo de dois pixels na tela seria
    // impossível de pegar de volta para ajustar.
    setRect((current) => (current !== null && !isUsable(current) ? null : current));
  };

  const save = () => {
    const canvas = canvasRef.current;
    if (canvas === null || rect === null || !isUsable(rect)) return;

    const cut = document.createElement("canvas");
    cut.width = Math.round(rect.width);
    cut.height = Math.round(rect.height);

    const context = cut.getContext("2d");
    if (context === null) return;

    context.drawImage(
      canvas,
      Math.round(rect.x),
      Math.round(rect.y),
      cut.width,
      cut.height,
      0,
      0,
      cut.width,
      cut.height,
    );

    cut.toBlob((png) => {
      if (png === null) return;
      // A caixa vai **normalizada**: é ela que sobrevive a uma mudança de zoom ou de DPI.
      onCrop({ pageNumber, box: normalizedBoxFrom(rect, size), png });
    }, "image/png");
  };

  /**
   * Lê a camada de texto da página atual e pede ao domínio as questões propostas.
   *
   * `lerCamadaDeTexto` chama `getViewport({ scale: 1 })` por dentro — o que sobe para
   * `segmentarPagina` são pontos do PDF, a mesma unidade em qualquer zoom, e é por isso que a
   * caixa devolvida (normalizada 0..1) cabe de volta na conta de desenho abaixo sem conversão.
   *
   * Página sem nenhuma palavra (PDF escaneado, sem camada de texto) devolve `[]` direto, sem
   * chamar o domínio: dizer "isto aqui não tem texto, desenhe à mão" é decisão da tela de cima,
   * não do visualizador.
   */
  const estimar = async () => {
    const doc = docRef.current;
    if (onEstimar === undefined || doc === null || isImage) return;

    setEstimando(true);
    try {
      const page = await doc.getPage(pageNumber);
      const camada = await lerCamadaDeTexto(page);

      if (camada.palavras.length === 0) {
        onEstimar([]);
        return;
      }

      onEstimar(segmentarPagina(camada));
    } finally {
      setEstimando(false);
    }
  };

  if (error !== null) {
    return (
      <div className="lbb-pdf" style={{ padding: "var(--space-4)" }}>
        <span className="lbb-pdf-info">Não deu para abrir o PDF: {error}</span>
      </div>
    );
  }

  const cursor = hover === null ? "crosshair" : CURSORS[hover];

  return (
    <div className="lbb-pdf">
      <div className="lbb-pdf-bar">
        <Button
          size="sm"
          variant="ghost"
          disabled={pageNumber <= 1}
          onClick={() => setPageNumber((n) => Math.max(1, n - 1))}
        >
          Anterior
        </Button>
        <span className="lbb-pdf-info">
          {pages === 0 ? "abrindo…" : `página ${pageNumber} de ${pages}`}
        </span>
        <Button
          size="sm"
          variant="ghost"
          disabled={pageNumber >= pages}
          onClick={() => setPageNumber((n) => Math.min(pages, n + 1))}
        >
          Próxima
        </Button>

        <span className="lbb-pdf-info">{Math.round(scale * 100)}%</span>
        <Button size="sm" variant="ghost" onClick={() => setScale((s) => Math.max(0.4, s - 0.2))}>
          −
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setScale((s) => Math.min(4, s + 0.2))}>
          +
        </Button>
        {/* Os dois ajustes servem a gestos diferentes: "largura" é para ler e recortar uma questão
            (o texto fica no maior tamanho legível, e rola-se para descer); "página" é para achar
            onde a questão está antes de mirar. */}
        <Button size="sm" variant="ghost" onClick={() => ajustar("largura")}>
          Ajustar à largura
        </Button>
        <Button size="sm" variant="ghost" onClick={() => ajustar("pagina")}>
          Página inteira
        </Button>

        {/* Só aparece com o retorno prometido **e** com uma camada de texto para ler — imagem não
            tem uma, então não há o que estimar. */}
        {onEstimar !== undefined && !isImage && (
          <Button size="sm" variant="ghost" disabled={estimando} onClick={() => void estimar()}>
            {estimando ? "Estimando…" : "Estimar questões"}
          </Button>
        )}

        {/* O gesto que paga a estimativa: sem ele, ver as caixas na tela não pouparia clique
            nenhum — seria preciso redesenhar cada uma à mão. */}
        {onCropLote !== undefined && estimadas !== undefined && estimadas.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => void recortarEstimadas()}>
            Recortar as {estimadas.length}
          </Button>
        )}

        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {rect !== null && (
            <Button size="sm" variant="ghost" onClick={() => setRect(null)}>
              Limpar recorte
            </Button>
          )}
          <Button
            size="sm"
            variant="primary"
            disabled={rect === null || !isUsable(rect)}
            onClick={save}
          >
            Salvar recorte
          </Button>
        </span>
      </div>

      <div className="lbb-pdf-stage" ref={stageRef}>
        <div
          className="lbb-pdf-holder"
          style={{ cursor }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={endDrag}
          // Soltar o botão fora da página é comum ao arrastar até a borda; sem isto o retângulo
          // ficaria preso ao mouse depois que a pessoa já soltou.
          onMouseLeave={endDrag}
        >
          <canvas ref={canvasRef} className="lbb-pdf-canvas" aria-label="Página do PDF" />

          {/* O destaque da origem. Não é interativo: mostrar de onde veio não é o mesmo gesto que
              recortar de novo, e um retângulo que se pega por engano apagaria a referência. */}
          {highlight !== null && highlight.pageNumber === pageNumber && size.width > 0 && (
            <div
              className="lbb-pdf-origin"
              aria-label="Recorte de origem"
              style={{
                left: highlight.box.x * size.width,
                top: highlight.box.y * size.height,
                width: highlight.box.width * size.width,
                height: highlight.box.height * size.height,
              }}
            />
          )}

          {/* As propostas de "Estimar questões" — mesmo esquema do destaque de origem acima: não
              são interativas. Aceitar, ajustar ou descartar uma proposta é gesto de outra tela,
              ainda por vir. */}
          {estimadas !== undefined &&
            size.width > 0 &&
            estimadas.map((estimada, indice) => (
              <div
                key={`${estimada.numero ?? "sem-numero"}-${indice}`}
                className="lbb-pdf-estimada"
                aria-label="Questão estimada"
                style={{
                  left: estimada.box.x * size.width,
                  top: estimada.box.y * size.height,
                  width: estimada.box.width * size.width,
                  height: estimada.box.height * size.height,
                }}
              >
                <span className="lbb-pdf-estimada-numero">
                  {estimada.numero === null ? "?" : estimada.numero}
                </span>
              </div>
            ))}

          {rect !== null && (
            <>
              <div
                className="lbb-pdf-rect"
                style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
              />
              {handlePositions(rect).map(([handle, point]) => (
                <div
                  key={handle}
                  className="lbb-pdf-handle"
                  style={{ left: point.x - 5, top: point.y - 5 }}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** As oito alças, para desenhar. A regra de qual está sob o cursor mora no domínio. */
function handlePositions(rect: PixelRect): ReadonlyArray<readonly [string, Point]> {
  const { x, y, width: w, height: h } = rect;

  return [
    ["nw", { x, y }],
    ["n", { x: x + w / 2, y }],
    ["ne", { x: x + w, y }],
    ["e", { x: x + w, y: y + h / 2 }],
    ["se", { x: x + w, y: y + h }],
    ["s", { x: x + w / 2, y: y + h }],
    ["sw", { x, y: y + h }],
    ["w", { x, y: y + h / 2 }],
  ];
}
