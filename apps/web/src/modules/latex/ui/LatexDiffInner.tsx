"use client";

import { DiffEditor } from "@monaco-editor/react";

import { LATEX_LANGUAGE_ID } from "@modules/latex/domain/latex-language";

import { EditorLoading } from "./EditorLoading";

/**
 * Diff de LaTeX lado a lado.
 *
 * O mesmo Monaco do editor, com a mesma linguagem registrada — um enunciado revisado num diff de
 * texto puro perderia o realce que torna `\SI{1000}{\real}` legível, e é justamente nesses
 * trechos que a mudança do agente costuma estar.
 *
 * Somente leitura nos dois lados: quem edita é o editor. Aqui só se decide aprovar ou não.
 */

export interface LatexDiffInnerProps {
  readonly before: string;
  readonly after: string;
  readonly height?: number;
  readonly theme?: "light" | "dark";
  readonly ariaLabel?: string;
}

export default function LatexDiffInner({
  before,
  after,
  height = 220,
  theme = "light",
  ariaLabel = "Diferenças",
}: LatexDiffInnerProps) {
  return (
    <div style={{ height, minHeight: 0 }} role="group" aria-label={ariaLabel}>
      <DiffEditor
        original={before}
        modified={after}
        language={LATEX_LANGUAGE_ID}
        theme={theme === "dark" ? "vs-dark" : "vs"}
        loading={<EditorLoading />}
        options={{
          readOnly: true,
          renderSideBySide: true,
          // `wordWrap` ligado: enunciado de prova tem parágrafos longos, e barra de rolagem
          // horizontal num diff faz a coluna da direita sair de sincronia com a da esquerda.
          wordWrap: "on",
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          renderOverviewRuler: false,
          fontSize: 13,
        }}
      />
    </div>
  );
}
