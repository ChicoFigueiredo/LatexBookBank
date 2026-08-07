"use client";

import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";

import {
  LATEX_LANGUAGE_CONFIGURATION,
  LATEX_LANGUAGE_ID,
  LATEX_MONARCH_TOKENS,
} from "@modules/latex/domain/latex-language";

/**
 * Monaco **local**, nunca de CDN.
 *
 * O `@monaco-editor/react` baixa o editor de `cdn.jsdelivr.net` por padrão. Isso quebra o
 * critério de sucesso da auditoria §48 — "o app roda ponta a ponta com a internet desligada" — e
 * quebra em silêncio: com rede, tudo funciona; sem rede, o editor fica num "Loading…" eterno sem
 * dizer por quê. `loader.config({ monaco })` aponta para o pacote instalado, e o bundler resolve.
 *
 * O custo é bundle maior. É o custo certo: um banco de questões local que precisa de internet
 * para abrir o editor não é local.
 */

let configured = false;

export function setupMonaco(): void {
  if (configured) return;
  configured = true;

  loader.config({ monaco });

  if (!monaco.languages.getLanguages().some((language) => language.id === LATEX_LANGUAGE_ID)) {
    monaco.languages.register({ id: LATEX_LANGUAGE_ID, extensions: [".tex"], aliases: ["LaTeX"] });

    // Os `as` existem porque o domínio declara a linguagem com tipos próprios, para não depender
    // do Monaco (a Fase 4 vai alimentar as mesmas estruturas a partir do banco legado). Este é o
    // único ponto de tradução, e é aqui que ele deve estar.
    monaco.languages.setLanguageConfiguration(LATEX_LANGUAGE_ID, {
      comments: LATEX_LANGUAGE_CONFIGURATION.comments,
      brackets: LATEX_LANGUAGE_CONFIGURATION.brackets as monaco.languages.CharacterPair[],
      autoClosingPairs: [...LATEX_LANGUAGE_CONFIGURATION.autoClosingPairs],
      surroundingPairs: [...LATEX_LANGUAGE_CONFIGURATION.surroundingPairs],
    });

    monaco.languages.setMonarchTokensProvider(
      LATEX_LANGUAGE_ID,
      LATEX_MONARCH_TOKENS as unknown as monaco.languages.IMonarchLanguage,
    );
  }
}

/**
 * Opções do editor.
 *
 * Minimap desligado (spec §10): num painel que divide espaço com a árvore e o preview, ele come
 * largura para mostrar uma miniatura de texto que ninguém navega. `wordWrap` ligado porque
 * enunciado de questão é prosa, não código — rolar na horizontal para ler uma frase é o oposto
 * do que a ferramenta deveria fazer.
 */
export const LATEX_EDITOR_OPTIONS = {
  minimap: { enabled: false },
  wordWrap: "on",
  lineNumbers: "on",
  fontFamily: "var(--font-mono)",
  fontSize: 13,
  lineHeight: 20,
  scrollBeyondLastLine: false,
  automaticLayout: true,
  renderWhitespace: "selection",
  tabSize: 2,
  bracketPairColorization: { enabled: true },
  padding: { top: 12, bottom: 12 },
  // O editor não pode capturar Ctrl+K: é a paleta de comandos do workbench, e um atalho que
  // funciona fora do editor e para dentro dele é pior que atalho nenhum.
  quickSuggestions: { other: true, comments: false, strings: false },
} as const;
