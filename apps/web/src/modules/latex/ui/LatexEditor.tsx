"use client";

import dynamic from "next/dynamic";

import { EditorLoading } from "./EditorLoading";

/**
 * Porta de entrada do editor no app.
 *
 * `ssr: false` **não é otimização** — é o que impede `monaco-editor` de ser avaliado no servidor.
 * O pacote toca `window`/`self` no topo do módulo, e num Client Component comum isso ainda roda
 * durante o SSR. Foi a tentativa de dispensar o `dynamic` que mostrou isso: sem ele, o build
 * quebra, e o item do checklist que pedia dynamic import estava certo desde o começo.
 *
 * O ganho de bundle é consequência, não motivo: nenhuma página importa `monaco-editor` direto,
 * então o peso fica atrás de um só limite e trocar de editor um dia mexe em um arquivo.
 */
export const LatexEditor = dynamic(() => import("./LatexEditorInner"), {
  ssr: false,
  loading: () => <EditorLoading />,
});

export type { LatexEditorApi, LatexEditorInnerProps as LatexEditorProps } from "./LatexEditorInner";
