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

/**
 * O worker do Monaco, apontado à mão.
 *
 * Sem isto o Monaco tenta criar o worker a partir de uma URL que o Turbopack reescreve, e a
 * página estoura um `TypeError` **não tratado** já no carregamento:
 *
 * ```
 * Failed to resolve module specifier
 *   '/_next/static/media/editorWebWorkerMain.<hash>.js#editorWorkerService'
 * ```
 *
 * Nada visível quebra na hora — o editor abre e aceita texto —, e é o que torna o defeito ruim:
 * quem abre o console vê um erro vermelho na tela principal e não tem como saber se o produto está
 * de pé. E o que **de fato** depende do worker é o cálculo de diferença, que é a superfície onde a
 * pessoa decide se aceita o que o agente propôs.
 *
 * `new URL(..., import.meta.url)` é a forma que o bundler entende: ele empacota o arquivo e
 * resolve o caminho final. Uma string literal seria um caminho que só existe em desenvolvimento.
 *
 * O caminho é `monaco-editor/editor/editor.worker.js` e **não** `.../esm/vs/...`: o `exports` do
 * pacote mapeia `"./*.js"` para `"./esm/vs/*.js"`, então escrever o caminho físico o duplica e o
 * bundler não acha nada.
 */
function installWorker(): void {
  if (typeof window === "undefined") return;

  (window as unknown as { MonacoEnvironment?: unknown }).MonacoEnvironment = {
    getWorker: () =>
      new Worker(new URL("monaco-editor/editor/editor.worker.js", import.meta.url), {
        type: "module",
      }),
  };
}

export function setupMonaco(): void {
  if (configured) return;
  configured = true;

  installWorker();
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
  quickSuggestions: { other: true, comments: false, strings: false },
  /**
   * **Sem sugestão de palavra do próprio documento** (#183).
   *
   * O Monaco propõe, por padrão, as palavras que já existem no texto aberto. Num editor de código
   * isso ajuda; num enunciado de prova é ruído — ele sugere "montante" enquanto alguém escreve
   * "montante", e a lista útil deste produto é outra: os 652 autocompletes do acervo legado, que
   * chegam pelo provider da Fase 4.
   *
   * A opção estava desligada **por acidente** até aqui: sugestão baseada em palavras é calculada no
   * worker, e o worker não carregava. Consertá-lo (nesta mesma issue) acordaria o comportamento
   * junto, sem ninguém ter decidido por ele — e a decisão certa continua sendo desligar.
   */
  wordBasedSuggestions: "off",
} as const;
