"use client";

import Editor, { type OnMount } from "@monaco-editor/react";
import { useCallback, useEffect, useRef, useState } from "react";

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
  /**
   * O trecho selecionado, ou `null` quando não há seleção.
   *
   * Existe para o painel do agente (Fase 8): perguntar "o que este trecho faz" precisa que o
   * trecho seja **anexado explicitamente**, e a alternativa — o agente ler o documento inteiro —
   * é justamente o que o contexto explícito recusa.
   *
   * Devolve as linhas junto porque um `\frac{1}{2}` solto não diz onde estava, e a resposta do
   * modelo costuma precisar apontar de volta para o editor.
   */
  readonly getSelection: () => EditorSelection | null;
  /**
   * Leva o cursor até uma linha — é o que faz o diagnóstico ser clicável.
   *
   * Imperativo pelo mesmo motivo do `insertSnippet`: rolar até uma linha é um gesto, não um
   * estado. Modelá-lo como propriedade obrigaria a inventar um "já rolei" para não rolar de novo a
   * cada re-render, e o cursor da pessoa seria arrastado no meio de uma frase.
   */
  readonly revealLine: (line: number) => void;
}

/**
 * Um diagnóstico do render, do jeito que o editor entende.
 *
 * Fica aqui e não em `rendering/` porque quem depende de quem importa: o editor não conhece render.
 * Ele sabe marcar linhas, e o painel de render é um dos que têm o que marcar.
 */
export interface EditorMarker {
  readonly line: number;
  readonly severity: "error" | "warning" | "info";
  readonly message: string;
}

export interface EditorSelection {
  readonly text: string;
  readonly startLine: number;
  readonly endLine: number;
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

/** O par que o `onMount` entrega. Tipado a partir dele para não adivinhar o nome do tipo. */
interface MountedEditor {
  readonly editor: Parameters<OnMount>[0];
  readonly monaco: Parameters<OnMount>[1];
}

/**
 * Um `owner` próprio para os marcadores do render.
 *
 * Sem ele, limpar a lista apagaria o que qualquer outro produtor tenha marcado no mesmo modelo —
 * e o Monaco não tem como saber que os dois não são a mesma coisa.
 */
const MARKER_OWNER = "render";

const SEVERITY = {
  error: (monaco: MountedEditor["monaco"]) => monaco.MarkerSeverity.Error,
  warning: (monaco: MountedEditor["monaco"]) => monaco.MarkerSeverity.Warning,
  info: (monaco: MountedEditor["monaco"]) => monaco.MarkerSeverity.Info,
} as const;

/** Constante de módulo: um `[]` literal no default seria um array novo a cada render. */
const EMPTY_MARKERS: readonly EditorMarker[] = [];

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
  /**
   * O que o compilador achou de errado **neste campo**.
   *
   * Marcador do Monaco e não decoração de linha: o marcador traz a mensagem no hover, entra na
   * navegação por `F8` e desenha o sublinhado que qualquer pessoa já reconhece de um editor. Uma
   * decoração pintaria a linha e deixaria a mensagem só no painel ao lado.
   */
  readonly markers?: readonly EditorMarker[];
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
  markers = EMPTY_MARKERS,
}: LatexEditorInnerProps) {
  // O conhecimento LaTeX do legado (#47) vira sugestão aqui. É um hook e não uma chamada no
  // `onMount` porque o provider é global por linguagem: quem o registra precisa também saber
  // desfazer isso quando o último editor sair de cena.
  useLatexCompletion();

  const saveRef = useRef(onSave);
  const renderRef = useRef(onRender);
  const readyRef = useRef(onReady);
  const mounted = useRef<MountedEditor | null>(null);

  /**
   * Os marcadores são reaplicados a cada mudança da lista **e** a cada montagem.
   *
   * A ordem entre "o render terminou" e "o editor montou" não é fixa: compilar e trocar de aba na
   * mesma respiração faz a lista chegar antes do editor existir. O efeito depende do `generation`
   * do mount justamente para rodar de novo quando o editor aparece.
   */
  const [mountGeneration, setMountGeneration] = useState(0);

  useEffect(() => {
    const current = mounted.current;
    const model = current?.editor.getModel();
    if (!current || !model) return;

    const lineCount = model.getLineCount();

    current.monaco.editor.setModelMarkers(
      model,
      // O `owner` isola estes marcadores: limpar a lista aqui não apaga o que outro produtor
      // (o próprio LaTeX do Monaco, um dia) tenha marcado.
      MARKER_OWNER,
      // Linha fora do texto é descartada, não aproximada. Acontece de verdade: o diagnóstico é de
      // uma compilação anterior, a pessoa apagou dez linhas desde então, e `getLineMaxColumn` de
      // uma linha inexistente **lança** — o editor inteiro sumiria por causa de um marcador.
      markers
        .filter((marker) => marker.line >= 1 && marker.line <= lineCount)
        .map((marker) => ({
          // Linha inteira: o log do TeX diz a linha, nunca a coluna. Sublinhar de 1 a 1 marcaria o
          // primeiro caractere e faria o erro parecer estar sempre no começo.
          startLineNumber: marker.line,
          endLineNumber: marker.line,
          startColumn: 1,
          endColumn: model.getLineMaxColumn(marker.line),
          message: marker.message,
          severity: SEVERITY[marker.severity](current.monaco),
        })),
    );
  }, [markers, mountGeneration]);

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
    mounted.current = { editor, monaco };
    // Não é `setState` dentro de efeito: é o Monaco avisando que existe, e é o único aviso que
    // existe. O contador só serve para o efeito dos marcadores rodar de novo agora.
    setMountGeneration((generation) => generation + 1);

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

      getSelection: () => {
        const selection = editor.getSelection();
        const model = editor.getModel();
        if (!selection || !model || selection.isEmpty()) return null;

        // `getValueInRange` e não o texto do DOM: o editor virtualiza as linhas, e o DOM só tem
        // as visíveis — uma seleção longa voltaria truncada sem nenhum sinal disso.
        return {
          text: model.getValueInRange(selection),
          startLine: selection.startLineNumber,
          endLine: selection.endLineNumber,
        };
      },

      revealLine: (line) => {
        const model = editor.getModel();
        if (!model) return;

        // Recorta pelo tamanho do texto em vez de recusar: o diagnóstico pode ser de uma
        // compilação anterior, e levar a pessoa ao fim do campo é mais útil que não fazer nada —
        // ela vê o campo certo e o texto que sobrou.
        const target = Math.min(Math.max(1, line), model.getLineCount());

        // `InCenter` e não `revealLine`: o padrão rola o mínimo possível, e a linha aparece colada
        // na borda de baixo — que é onde ninguém olha ao chegar de outro painel.
        editor.revealLineInCenter(target);
        editor.setPosition({ lineNumber: target, column: 1 });
        editor.focus();
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
