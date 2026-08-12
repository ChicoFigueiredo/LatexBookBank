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
  { id: "editor", label: "Editor do livro", icon: "list-tree", group: "Acervo" },
  { id: "captura", label: "Captura", icon: "scan-text", group: "Produção" },
  { id: "avaliacoes", label: "Avaliações", icon: "clipboard-list", group: "Produção" },
  { id: "lixeira", label: "Lixeira", icon: "archive", group: "Sistema" },
  { id: "diagnostico", label: "Diagnóstico", icon: "activity", group: "Sistema" },
];

/**
 * Para onde cada módulo leva.
 *
 * "Captura" e "Editor do livro" dependem de um livro aberto — editar sem destino não é um estado
 * que faça sentido —, então quem não tem publicação corrente cai na lista de publicações para
 * escolher uma. Botão que não leva a lugar nenhum é pior que botão ausente (§81).
 *
 * `Publicações` e `Editor do livro` são destinos **diferentes** e é assim no protótipo: um é a
 * lista de onde se escolhe, o outro é a árvore de um livro já escolhido. Enquanto a rota do livro
 * abria o workbench direto, os dois eram o mesmo lugar e o segundo não existia.
 */
export function railHref(id: string, publicationId?: string | null): string {
  switch (id) {
    case "inicio":
      return "/";
    case "bibliotecas":
      return "/bibliotecas";
    case "publicacoes":
      return "/publicacoes";
    case "editor":
      return publicationId ? `/publications/${publicationId}/editor` : "/publicacoes";
    case "captura":
      return publicationId ? `/publications/${publicationId}/ingestao` : "/publicacoes";
    case "avaliacoes":
      return "/avaliacoes";
    case "lixeira":
      return "/lixeira";
    case "diagnostico":
      return "/diagnostico";
    default:
      return "/";
  }
}
