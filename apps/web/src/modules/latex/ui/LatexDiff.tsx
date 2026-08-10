"use client";

import dynamic from "next/dynamic";

import { EditorLoading } from "./EditorLoading";

/**
 * `ssr: false` pelo mesmo motivo do `LatexEditor`: `monaco-editor` toca `window` no topo do
 * módulo, e num Client Component comum isso ainda roda durante o SSR.
 */
export const LatexDiff = dynamic(() => import("./LatexDiffInner"), {
  ssr: false,
  loading: () => <EditorLoading />,
});

export type { LatexDiffInnerProps as LatexDiffProps } from "./LatexDiffInner";
