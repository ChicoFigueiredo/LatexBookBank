"use client";

import Editor, { type OnMount } from "@monaco-editor/react";
import { useCallback, useEffect, useRef } from "react";

import { LATEX_LANGUAGE_ID } from "@modules/latex/domain/latex-language";
import { useLatexCompletion } from "@modules/latex-knowledge/ui/use-latex-completion";

import { EditorLoading } from "./EditorLoading";
import { LATEX_EDITOR_OPTIONS, setupMonaco } from "./monaco-setup";

/**
 * O editor de verdade. **Só carrega no navegador** — quem garante isso é o `dynamic` com
 * `ssr: false` em `LatexEditor.tsx`.
 *
 * A separação existe por um motivo concreto: este arquivo importa `monaco-editor` estaticamente,
 * e o pacote toca `window`/`self` ao ser avaliado. Num módulo cliente comum isso ainda roda no
 * servidor durante o SSR e quebra. Com `ssr: false`, o módulo nunca chega lá.
 *
 * E é por isso que `setupMonaco()` pode rodar **no escopo do módulo**, antes de qualquer render:
 * o `loader.config` precisa acontecer antes de o `<Editor>` iniciar o carregamento, ou ele já
 * terá partido para o CDN. Um `useEffect` aqui não serviria — efeitos de filho rodam antes dos
 * do pai, e o `<Editor>` é o filho.
 */
setupMonaco();

export interface LatexEditorInnerProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSave?: () => void;
  readonly readOnly?: boolean;
  readonly theme?: "light" | "dark";
  readonly ariaLabel?: string;
}

export default function LatexEditorInner({
  value,
  onChange,
  onSave,
  readOnly = false,
  theme = "light",
  ariaLabel = "Editor LaTeX",
}: LatexEditorInnerProps) {
  // O conhecimento LaTeX do legado (#47) vira sugestão aqui. É um hook e não uma chamada no
  // `onMount` porque o provider é global por linguagem: quem o registra precisa também saber
  // desfazer isso quando o último editor sair de cena.
  useLatexCompletion();

  const saveRef = useRef(onSave);

  // O handler do Ctrl+S é registrado uma vez no `onMount`; sem o ref, ele congelaria a primeira
  // versão do callback e passaria a salvar a questão que estava aberta quando o editor montou.
  useEffect(() => {
    saveRef.current = onSave;
  }, [onSave]);

  const handleMount = useCallback<OnMount>((editor, monaco) => {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveRef.current?.();
    });
  }, []);

  return (
    // O Monaco cria o próprio textarea acessível por dentro; o rótulo aqui nomeia a região.
    <div style={{ height: "100%", minHeight: 0 }} aria-label={ariaLabel} role="group">
      <Editor
        language={LATEX_LANGUAGE_ID}
        value={value}
        onChange={(next) => onChange(next ?? "")}
        onMount={handleMount}
        theme={theme === "dark" ? "vs-dark" : "vs"}
        loading={<EditorLoading />}
        options={{ ...LATEX_EDITOR_OPTIONS, readOnly }}
      />
    </div>
  );
}
