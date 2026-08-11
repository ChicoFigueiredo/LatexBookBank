import type { WorkbenchModule } from "@/design-system";

/**
 * O rail do produto, num lugar só.
 *
 * Estava declarado dentro do workbench da publicação, então a Home não tinha rail nenhum e o
 * usuário chegava numa tela sem saída. Rail duplicado seria pior: duas listas divergindo é como
 * um módulo passa a existir em metade do produto.
 *
 * A ordem é a do design aprovado — Acervo primeiro, Produção depois, Sistema por último. É ordem
 * de trabalho, não alfabética.
 */

export const RAIL_MODULES: readonly WorkbenchModule[] = [
  { id: "inicio", label: "Início", icon: "house", group: "Acervo" },
  { id: "bibliotecas", label: "Bibliotecas", icon: "library", group: "Acervo" },
  { id: "publicacoes", label: "Publicações", icon: "book-open", group: "Acervo" },
  { id: "captura", label: "Captura", icon: "scan-text", group: "Produção" },
  { id: "avaliacoes", label: "Avaliações", icon: "clipboard-list", group: "Produção" },
  { id: "diagnostico", label: "Diagnóstico", icon: "activity", group: "Sistema" },
];

/**
 * Para onde cada módulo leva.
 *
 * "Captura" depende de um livro aberto — capturar sem destino não é um estado que faça sentido —,
 * então quem não tem publicação corrente cai na lista de publicações para escolher uma. Botão que
 * não leva a lugar nenhum é pior que botão ausente (§81).
 */
export function railHref(id: string, publicationId?: string | null): string {
  switch (id) {
    case "inicio":
      return "/";
    case "bibliotecas":
      return "/bibliotecas";
    case "publicacoes":
      return "/publicacoes";
    case "captura":
      return publicationId ? `/publications/${publicationId}/ingestao` : "/publicacoes";
    case "avaliacoes":
      return "/avaliacoes";
    case "diagnostico":
      return "/diagnostico";
    default:
      return "/";
  }
}
