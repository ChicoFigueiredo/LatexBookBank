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

/**
 * O que o resto do app pode pedir ao editor.
 *
 * Uma superfície imperativa mínima, e só porque inserir no cursor **é** imperativo: a palette não
 * conhece o texto, conhece a posição. Expor o editor inteiro convidaria o resto do app a mexer no
 * modelo por fora, e aí o autosave deixaria de ser a única porta de escrita.
 */
export interface LatexEditorApi {
  /** Insere um corpo de snippet na seleção corrente, resolvendo `${1:…}` e `$TM_SELECTED_TEXT`. */
  readonly insertSnippet: (body: string) => void;
}

/**
 * O contrato do `snippetController2` do Monaco, restrito ao que usamos.
 *
 * `dispose` entra porque `getContribution` exige `IEditorContribution`; quem descarta a
 * contribuição é o editor, não nós.
 */
interface SnippetController {
  insert(template: string): void;
  dispose(): void;
}

export interface LatexEditorInnerProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSave?: () => void;
  /** `Ctrl+Enter` — compilação autoritativa (spec §12). */
  readonly onRender?: () => void;
  readonly readOnly?: boolean;
  readonly theme?: "light" | "dark";
  readonly ariaLabel?: string;
  readonly onReady?: (api: LatexEditorApi) => void;
}

export default function LatexEditorInner({
  value,
  onChange,
  onSave,
  onRender,
  readOnly = false,
  theme = "light",
  ariaLabel = "Editor LaTeX",
  onReady,
}: LatexEditorInnerProps) {
  // O conhecimento LaTeX do legado (#47) vira sugestão aqui. É um hook e não uma chamada no
  // `onMount` porque o provider é global por linguagem: quem o registra precisa também saber
  // desfazer isso quando o último editor sair de cena.
  useLatexCompletion();

  const saveRef = useRef(onSave);
  const renderRef = useRef(onRender);
  const readyRef = useRef(onReady);

  useEffect(() => {
    readyRef.current = onReady;
  }, [onReady]);

  // O handler do Ctrl+S é registrado uma vez no `onMount`; sem o ref, ele congelaria a primeira
  // versão do callback e passaria a salvar a questão que estava aberta quando o editor montou.
  useEffect(() => {
    saveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    renderRef.current = onRender;
  }, [onRender]);

  const handleMount = useCallback<OnMount>((editor, monaco) => {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveRef.current?.();
    });

    // `Ctrl+Enter` registrado no editor, e não numa escuta de janela: um atalho global roubaria
    // o Enter de qualquer campo de texto da tela, e o `Ctrl+K` do workbench já mostrou que
    // atalho que vaza do editor é pior que atalho nenhum.
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      renderRef.current?.();
    });

    readyRef.current?.({
      insertSnippet: (body) => {
        // `snippetController2` e não `executeEdits`: é ele que interpreta `${1:…}` e resolve
        // `$TM_SELECTED_TEXT`. Com `executeEdits` o texto entraria cru, com as chaves à mostra.
        const controller = editor.getContribution<SnippetController>("snippetController2");
        // O foco vem antes: sem ele o snippet é inserido, mas o cursor fica na palette e o Tab
        // navega os botões em vez dos pontos de parada.
        editor.focus();
        controller?.insert(body);
      },
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
