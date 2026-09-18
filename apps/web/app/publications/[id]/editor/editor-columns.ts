"use client";

import { useEffect, useState } from "react";

import { useStoredState } from "@/design-system";

/**
 * O rateio das colunas do editor — o mesmo para a questão e para o corpo do nó.
 *
 * As colunas são três: o LaTeX, o preview e a fonte (o PDF do livro, só com *Ver fonte* ligado,
 * D43). A largura guardada é o **pedido** da pessoa; a efetiva é o que cabe hoje, nesta janela,
 * com esta palette aberta. As três somadas preenchem a área toda: sobrar branco à direita seria
 * desperdiçar tela, e transbordar esconderia a fonte atrás da borda.
 *
 * Quem cede é a direita, proporcionalmente — duas colunas apertadas encolhem juntas, e não uma
 * até sumir enquanto a outra fica intacta — e só até `COLUMN_HARD_MIN`. O editor cede depois
 * disso, e nunca abaixo de `EDITOR_MIN_W`: é o piso que o checklist declara e o
 * `e2e/layout.spec.ts` confere, uma linha de LaTeX sem quebra no meio de um comando.
 *
 * Encolher não grava nada. Voltar à janela de antes devolve a cada coluna o tamanho pedido.
 */

const EDITOR_MIN_W = 420;
const EDITOR_HARD_MIN = 200;
const COLUMN_HARD_MIN = 160;
const DEFAULT_PREVIEW_W = 560;
const DEFAULT_SOURCE_W = 520;
/** A divisória tem 7 px com −3 px de margem de cada lado: ocupa 1 px de layout. */
const DIVIDER_W = 1;

/**
 * As larguras são preferência da pessoa, não do livro nem do nó: uma vez ajustadas, valem em
 * qualquer questão e em qualquer capítulo. As chaves nasceram no editor da questão e ficaram como
 * estão para não zerar o ajuste de quem já arrastou.
 */
const PREVIEW_KEY = "lbb:editor-questao:preview-w";
const SOURCE_KEY = "lbb:editor-questao:source-w";

/** O que o `Divider` do design system precisa para uma coluna. */
export interface ColumnDivider {
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly defaultValue: number;
  readonly onChange: (value: number) => void;
  readonly invert: true;
  readonly label: string;
}

export interface EditorColumns {
  readonly previewWidth: number;
  readonly sourceWidth: number;
  readonly previewDivider: ColumnDivider;
  readonly sourceDivider: ColumnDivider;
}

export function useEditorColumns(input: {
  /**
   * O contêiner das colunas, guardado em estado por quem chama — `<div ref={setContainer}>`.
   *
   * Estado, e não `ref`: o contêiner nem sempre existe no primeiro render (o corpo do nó só o
   * monta depois de carregar), então um observador armado uma vez no `mount` nunca mediria nada.
   * E um objeto de `ref` no retorno tornaria ilegal ler as larguras durante o render
   * (`react-hooks/refs`), que é exatamente o que a tela faz com elas.
   */
  readonly container: HTMLDivElement | null;
  readonly previewOpen: boolean;
  readonly sourceOpen: boolean;
  /** Painéis fixos à direita (a palette de símbolos), que não entram no rateio. */
  readonly fixedWidth?: number;
}): EditorColumns {
  const { container, previewOpen, sourceOpen, fixedWidth = 0 } = input;
  const [previewW, setPreviewW] = useStoredState(PREVIEW_KEY, DEFAULT_PREVIEW_W);
  const [sourceW, setSourceW] = useStoredState(SOURCE_KEY, DEFAULT_SOURCE_W);

  const [measured, setMeasured] = useState(0);
  useEffect(() => {
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setMeasured(entry.contentRect.width);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [container]);

  const openColumns = (previewOpen ? 1 : 0) + (sourceOpen ? 1 : 0);
  const available = Math.max(0, measured - fixedWidth - openColumns * DIVIDER_W);
  const desiredPreview = previewOpen ? previewW : 0;
  const desiredSource = sourceOpen ? sourceW : 0;
  const desired = desiredPreview + desiredSource;

  const editorFloor =
    available - EDITOR_MIN_W >= openColumns * COLUMN_HARD_MIN
      ? EDITOR_MIN_W
      : Math.max(EDITOR_HARD_MIN, available - openColumns * COLUMN_HARD_MIN);
  const rightTotal = Math.max(0, Math.min(desired, available - editorFloor));
  // Antes da primeira medida não há o que ratear: usar o pedido evita as colunas piscarem em zero.
  const scale = measured === 0 ? 1 : desired > 0 ? rightTotal / desired : 0;
  const previewWidth = Math.round(desiredPreview * scale);
  const sourceWidth = Math.round(desiredSource * scale);
  const slack = Math.max(0, available - editorFloor - previewWidth - sourceWidth);

  return {
    previewWidth,
    sourceWidth,
    // As divisórias trabalham no valor **visível**: arrastar escreve o pedido a partir do que se
    // vê, e não a partir de um número guardado que a janela de hoje já não respeita.
    previewDivider: {
      value: previewWidth,
      min: COLUMN_HARD_MIN,
      max: Math.max(COLUMN_HARD_MIN, previewWidth + slack),
      defaultValue: DEFAULT_PREVIEW_W,
      onChange: setPreviewW,
      invert: true,
      label: "Redimensionar o preview",
    },
    sourceDivider: {
      value: sourceWidth,
      min: COLUMN_HARD_MIN,
      max: Math.max(COLUMN_HARD_MIN, sourceWidth + slack),
      defaultValue: DEFAULT_SOURCE_W,
      onChange: setSourceW,
      invert: true,
      label: "Redimensionar a fonte",
    },
  };
}
