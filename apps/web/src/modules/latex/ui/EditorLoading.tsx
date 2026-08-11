"use client";

import { EmptyState } from "@/design-system";

/**
 * O mesmo estado antes e depois da hidratação.
 *
 * Um `null` aqui faria o painel colapsar e o layout pular quando o editor chegasse — e a spec §34
 * pede que carregar nunca congele nem sacuda a UI. Fica em arquivo próprio porque é usado tanto
 * pelo `dynamic` (antes do módulo do editor existir) quanto pelo `<Editor>` (enquanto ele monta).
 */
export function EditorLoading() {
  return (
    <div style={{ display: "grid", placeItems: "center", height: "100%", minHeight: 160 }}>
      <EmptyState icon="file-text" title="Carregando o editor…" />
    </div>
  );
}
