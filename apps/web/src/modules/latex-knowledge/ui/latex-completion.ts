"use client";

import * as monaco from "monaco-editor";

import { LATEX_LANGUAGE_ID } from "@modules/latex/domain/latex-language";
import { replaceStartColumn } from "@modules/latex-knowledge/domain/completion-range";
import type { CompletionCandidate } from "@modules/latex-knowledge/domain/snippet-completion";

/**
 * O autocomplete do LaTeX dentro do Monaco.
 *
 * Este arquivo é só adaptação: o que ordenar, o que mostrar e o que inserir já foi decidido no
 * domínio (`snippet-completion.ts`). Aqui ficam as duas coisas que **são** do editor — o intervalo
 * que a sugestão substitui e o modo de inserção — e as duas têm armadilha.
 */

/**
 * Traduz um candidato do domínio para o item do Monaco.
 *
 * **`InsertAsSnippet` sempre, mesmo sem ponto de parada.** O corpo vem do importador escapado para
 * o parser de snippet: `\alpha` está gravado como `\\alpha`. Inserido como texto puro, apareceria
 * literalmente `\\alpha` na tela. O parser é quem desfaz o escape, então todo item passa por ele —
 * `isSnippet` decide o **ícone**, não o modo de inserção.
 */
function toMonacoItem(
  candidate: CompletionCandidate,
  range: monaco.IRange,
): monaco.languages.CompletionItem {
  return {
    label: candidate.label,
    kind: candidate.isSnippet
      ? monaco.languages.CompletionItemKind.Snippet
      : monaco.languages.CompletionItemKind.Function,
    insertText: candidate.insertText,
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    range,
    filterText: candidate.filterText,
    sortText: candidate.sortText,
    ...(candidate.detail !== null ? { detail: candidate.detail } : {}),
    ...(candidate.documentation !== null ? { documentation: candidate.documentation } : {}),
  };
}

/**
 * Registra o provider e devolve como desfazer.
 *
 * Devolver o `IDisposable` não é formalidade: em desenvolvimento o hot reload reavalia o módulo, e
 * sem descartar o anterior cada recarga somaria mais um provider — a lista passaria a mostrar cada
 * sugestão duas, três, quatro vezes.
 */
export function registerLatexCompletion(
  candidates: readonly CompletionCandidate[],
): monaco.IDisposable {
  return monaco.languages.registerCompletionItemProvider(LATEX_LANGUAGE_ID, {
    // A barra abre a lista sozinha. `Ctrl+Space` continua funcionando em qualquer posição — é o
    // Monaco que chama o provider, e o caminho sem barra abaixo é o que atende esse caso.
    triggerCharacters: ["\\"],

    provideCompletionItems(model, position) {
      const lineUntilCursor = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });

      const word = model.getWordUntilPosition(position);

      const range: monaco.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: replaceStartColumn(lineUntilCursor, position.column, word.startColumn),
        endColumn: position.column,
      };

      return { suggestions: candidates.map((candidate) => toMonacoItem(candidate, range)) };
    },
  });
}
