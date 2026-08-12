"use client";

import { createContext, useContext, type ReactNode } from "react";

import {
  EMPTY_RAIL_SUMMARY,
  type RailSummary,
} from "@modules/workspaces/domain/rail-summary";

/**
 * As contagens do rail, lidas uma vez por requisição e disponíveis em toda tela.
 *
 * O rail é montado por cada tela do produto. Buscar a contagem onde ela é usada seria a mesma
 * pergunta repetida em oito lugares — oito consultas e oito chances de um número discordar do
 * outro na mesma sessão. O layout raiz lê uma vez e desce por contexto.
 *
 * Por contexto e **não** por `fetch` no cliente, apesar de o segundo ser mais fácil: o número
 * apareceria depois da montagem, com o rail pulando de largura no primeiro frame de toda navegação.
 * Vindo do servidor, servidor e cliente renderizam o mesmo — que é a lição que a Home cobrou caro.
 */

const RailCountsContext = createContext<RailSummary>(EMPTY_RAIL_SUMMARY);

export function RailCountsProvider({
  value,
  children,
}: {
  readonly value: RailSummary;
  readonly children: ReactNode;
}) {
  return <RailCountsContext.Provider value={value}>{children}</RailCountsContext.Provider>;
}

export const useRailCounts = (): RailSummary => useContext(RailCountsContext);
