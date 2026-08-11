"use client";

import { useEffect } from "react";

import type { CompletionCandidate } from "@modules/latex-knowledge/domain/snippet-completion";

import { registerLatexCompletion } from "./latex-completion";

/**
 * Carrega os itens de autocomplete uma vez por sessão e os registra no Monaco.
 *
 * A lista é global e não muda enquanto o app está aberto, então a promessa fica no escopo do
 * módulo: trocar de questão não refaz a requisição, e dois editores abertos ao mesmo tempo
 * compartilham a mesma carga em vez de dispararem duas.
 */

let pending: Promise<readonly CompletionCandidate[]> | null = null;

async function fetchCandidates(): Promise<readonly CompletionCandidate[]> {
  const response = await fetch("/api/latex/snippets");
  if (!response.ok) throw new Error(`Falha ao carregar autocompletes (${response.status}).`);

  const payload: unknown = await response.json();
  if (typeof payload !== "object" || payload === null || !("snippets" in payload)) return [];

  const snippets = (payload as { snippets: unknown }).snippets;
  return Array.isArray(snippets) ? (snippets as CompletionCandidate[]) : [];
}

const loadCandidates = (): Promise<readonly CompletionCandidate[]> => {
  // Uma falha não fica cacheada: sem isto, um erro de rede na primeira montagem deixaria o
  // autocomplete morto pelo resto da sessão, sem nada a fazer além de recarregar a página.
  pending ??= fetchCandidates().catch((error: unknown) => {
    pending = null;
    throw error;
  });
  return pending;
};

/**
 * O provider é **global por linguagem**, não por editor.
 *
 * Registrar em cada montagem faria dois editores abertos mostrarem cada sugestão duas vezes. O
 * contador resolve: o primeiro registra, o último descarta.
 */
let registration: { readonly dispose: () => void } | null = null;
let mounted = 0;

export function useLatexCompletion(): void {
  useEffect(() => {
    let active = true;
    mounted += 1;

    void loadCandidates()
      .then((candidates) => {
        if (!active || registration !== null) return;
        registration = registerLatexCompletion(candidates);
      })
      .catch((error: unknown) => {
        // Autocomplete é ganho, não requisito: o editor continua inteiro sem ele. Um aviso no
        // console é o que cabe aqui — a superfície visível chega junto com a palette, que tem
        // onde mostrar "o conhecimento LaTeX não foi importado nesta instalação".
        console.warn("Autocomplete LaTeX indisponível:", error);
      });

    return () => {
      active = false;
      mounted -= 1;
      if (mounted === 0) {
        registration?.dispose();
        registration = null;
      }
    };
  }, []);
}
