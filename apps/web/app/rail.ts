import type { WorkbenchModule } from "@/design-system";
import type { RailSummary } from "@modules/workspaces/domain/rail-summary";

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

/**
 * O rail com as contagens do protótipo.
 *
 * Uma contagem só aparece quando é maior que zero: `Bibliotecas 0` é uma linha gastando tinta para
 * dizer que não há nada, e o rail é a única coisa que aparece em **toda** tela — o custo de ruído
 * aqui é pago o tempo todo.
 *
 * `Captura` é a única com tom de aviso, e é assim no protótipo: as outras duas são tamanho do
 * acervo — informação —, e a fila de captura é trabalho parado esperando alguém. Um número em
 * âmbar que não pede ação nenhuma ensina a ignorar o âmbar.
 */
export function railModules(counts?: RailSummary): readonly WorkbenchModule[] {
  if (!counts) return RAIL_MODULES;

  return RAIL_MODULES.map((entry) => {
    switch (entry.id) {
      case "bibliotecas":
        return badge(entry, counts.libraries);
      case "publicacoes":
        return badge(entry, counts.publications);
      case "captura":
        return badge(entry, counts.captureQueue, "warn");
      case "lixeira":
        return badge(entry, counts.trash);
      default:
        return entry;
    }
  });
}

const badge = (
  entry: WorkbenchModule,
  valor: number,
  tone?: "warn",
): WorkbenchModule =>
  valor > 0
    ? { ...entry, badge: valor, ...(tone ? { badgeTone: tone } : {}) }
    : entry;

export const RAIL_MODULES: readonly WorkbenchModule[] = [
  { id: "inicio", label: "Início", icon: "house", group: "Acervo" },
  { id: "bibliotecas", label: "Bibliotecas", icon: "library", group: "Acervo" },
  { id: "publicacoes", label: "Publicações", icon: "book-open", group: "Acervo" },
  { id: "editor", label: "Editor do livro", icon: "list-tree", group: "Acervo" },
  { id: "captura", label: "Captura", icon: "scan-text", group: "Produção" },
  { id: "avaliacoes", label: "Avaliações", icon: "clipboard-list", group: "Produção" },
  { id: "importar", label: "Importar / exportar", icon: "download-cloud", group: "Sistema" },
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
    case "importar":
      return "/importar";
    case "lixeira":
      return "/lixeira";
    case "diagnostico":
      return "/diagnostico";
    default:
      return "/";
  }
}
