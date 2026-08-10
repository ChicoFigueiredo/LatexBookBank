"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import {
  ArtifactStatus,
  type ArtifactStatusId,
  Banner,
  Button,
  ContextMenu,
  EmptyState,
  Input,
  Chip,
  Select,
  Modal,
  PageHeader,
  Tree,
  Workbench,
  filterTree,
  useStoredState,
  type Command,
  type ContextMenuItem,
  type IconName,
  type TreeNode,
  type WorkbenchModule,
} from "@/design-system";
import type { AiSetupDescription } from "@modules/agents/domain/ai-setup";
import {
  attach,
  clearContext,
  detach,
  EMPTY_CONTEXT,
  ContextTooLargeError,
  selectionItem,
  type AgentContext,
} from "@modules/agents/domain/agent-context";
import type { AgentMode } from "@modules/agents/domain/agent-run";
import type { Change } from "@modules/agents/domain/patch-diff";
import { AgentPanel, type AgentTurn } from "@modules/agents/ui/AgentPanel";
import type { EditorSelection } from "@modules/latex/ui/LatexEditor";
import type { TreeNodeDto } from "@modules/document-tree/application/get-publication-tree";
import type { SearchHit } from "@modules/questions/domain/search-query";
import { countTags, matchesAllTags } from "@modules/questions/domain/tag-filter";
import { NODE_STATUS_LABELS, type NodeStatusId } from "@modules/document-tree/domain/node-status";
import { sameTag } from "@modules/questions/domain/tag";

import { QuestionEditor } from "./question-editor";
import { DraggableTreeRow, TreeDnd } from "./tree-dnd";
import { useTreeEditing } from "./use-tree-editing";

/**
 * Primeira tela montada sobre o workbench (D14): rail de módulos, árvore na sidebar, questão no
 * main e o painel do agente no aside — fechado, com o FAB `✦`.
 *
 * Continua sendo demonstração: edição, render e agente chegam nas Fases 3, 6 e 8. O que esta
 * tela prova agora é a **geometria** — que as seis zonas existem, redimensionam, persistem e
 * conversam entre si.
 */

const MODULES: readonly WorkbenchModule[] = [
  { id: "biblioteca", label: "Biblioteca", icon: "library" },
  { id: "publicacoes", label: "Publicações", icon: "book-open" },
  { id: "avaliacoes", label: "Avaliações", icon: "clipboard-list" },
  { id: "importacao", label: "Importação", icon: "download-cloud" },
  { id: "diagnostico", label: "Diagnóstico", icon: "activity", group: "Sistema" },
];

/**
 * De estado da árvore para selo do design system.
 *
 * Um mapa e não `status as ArtifactStatusId`: os dois vocabulários coincidem hoje em quatro
 * nomes e não são a mesma lista. O cast passaria despercebido no dia em que um deles crescer.
 */
const STATUS_TO_ARTIFACT: Readonly<Record<NodeStatusId, ArtifactStatusId>> = {
  unsaved: "draft",
  render_failed: "render_failed",
  invalid: "invalid",
  unvalidated: "unvalidated",
  valid: "valid",
  render_done: "render_done",
};

const KIND_ICONS: Readonly<Record<string, IconName>> = {
  BOOK: "book-open",
  PART: "library",
  CHAPTER: "book-open",
  SECTION: "list-tree",
  SUBSECTION: "list-tree",
  CONTENT: "file-text",
  QUESTION_GROUP: "list-tree",
  QUESTION: "circle-help",
  FIGURE: "image",
  NOTE: "file-text",
};

/**
 * Reconstrói o aninhamento a partir de `depth`.
 *
 * O DTO não expõe `parentId` de propósito — é uma coluna do schema, e a auditoria §40 proíbe que
 * vaze para a apresentação. `depth` basta: a lista já vem em pré-ordem, então uma pilha
 * reconstrói a hierarquia sem que a UI precise saber como o pai é guardado.
 */
function nest(flat: readonly TreeNodeDto[], unsavedId: string | null = null): TreeNode[] {
  const roots: TreeNode[] = [];
  const stack: { depth: number; children: TreeNode[] }[] = [{ depth: -1, children: roots }];

  for (const dto of flat) {
    while (stack.length > 1 && (stack[stack.length - 1]?.depth ?? -1) >= dto.depth) stack.pop();

    const children: TreeNode[] = [];

    // "Não salvo" só o cliente sabe, e por isso entra aqui e não no DTO: é estado da sessão, não
    // da linha. Vence os outros porque é o único que se perde ao clicar em outro nó.
    const status = dto.question?.id === unsavedId && unsavedId !== null ? "unsaved" : dto.status;

    const node: TreeNode = {
      id: dto.id,
      label: dto.title,
      ...(KIND_ICONS[dto.kind] ? { icon: KIND_ICONS[dto.kind] as IconName } : {}),
      ...(dto.question ? { badge: `${dto.question.options.length}` } : {}),
      ...(status !== null && status !== undefined
        ? {
            status: (
              <ArtifactStatus
                status={STATUS_TO_ARTIFACT[status]}
                size="sm"
                // Só o ícone: numa árvore de 297 nós, o rótulo por extenso empurraria o título
                // da questão para fora da coluna. O nome vai no `aria-label` e no `title` —
                // ícone sozinho é enigma para quem usa leitor de tela.
                label=""
                aria-label={NODE_STATUS_LABELS[status]}
                title={NODE_STATUS_LABELS[status]}
              />
            ),
          }
        : {}),
      children,
    };

    stack[stack.length - 1]?.children.push(node);
    stack.push({ depth: dto.depth, children });
  }

  return roots;
}

export interface PublicationWorkbenchProps {
  readonly publicationId: string;
  /** O workspace dono. Resolvido no servidor: a tag é por workspace, e o cliente não escolhe. */
  readonly workspaceId: string;
  readonly publicationTitle: string;
  readonly publisher: string | null;
  readonly nodes: readonly TreeNodeDto[];
  /**
   * Rótulos da IA configurada, resolvidos no servidor. `null` quando não há nenhuma.
   *
   * Só rótulos atravessam: a chave fica do lado de lá, e o teste de fronteira prova que fica.
   */
  readonly ai: AiSetupDescription | null;
}

export function PublicationWorkbench({
  publicationId,
  workspaceId,
  publicationTitle,
  publisher,
  nodes,
  ai,
}: PublicationWorkbenchProps) {
  /**
   * O nó corrente sobrevive à sessão.
   *
   * Fica aqui e não dentro da `Tree` porque a seleção é do **workbench**: o editor, o breadcrumb
   * e o painel do agente dependem dela. A árvore persiste o que é dela — quais ramos estão
   * abertos.
   */
  const [selectedId, setSelectedId] = useStoredState<string | null>(
    `lbb:tree:${publicationTitle}:selected`,
    nodes[0]?.id ?? null,
  );

  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  // Tags selecionadas, por nome. Nome e não id porque é o que o DTO da árvore carrega — e é
  // `matchesAllTags` que sabe que "funcao" e "Função" são a mesma coisa.
  const [tagFilter, setTagFilter] = useState<readonly string[]>([]);
  // A questão com alteração pendente no editor. Vive aqui e não no DTO porque é estado da
  // **sessão**, não da linha: recarregar a página o perde, e é justamente por isso que ele é o
  // indicador mais urgente enquanto existe.
  const [unsavedQuestionId, setUnsavedQuestionId] = useState<string | null>(null);
  const [problemOnly, setProblemOnly] = useState(false);

  /**
   * O contexto do agente — montado por gesto, nunca por dedução.
   *
   * Vive no workbench e não dentro do painel porque quem tem os dados para anexar é esta tela: o
   * nó corrente, o editor, o render. O painel só mostra e remove.
   *
   * **Não** persiste entre sessões, ao contrário de quase tudo aqui. Reabrir o app amanhã com um
   * trecho de outra questão pendurado no contexto, sem lembrar de tê-lo anexado, é exatamente o
   * tipo de surpresa que o contexto explícito existe para impedir.
   */
  const [agentContext, setAgentContext] = useState<AgentContext>(EMPTY_CONTEXT);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [agentTurns, setAgentTurns] = useState<readonly AgentTurn[]>([]);
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentMode, setAgentMode] = useState<AgentMode>("ASK");

  /**
   * Resultados da busca no acervo, para a paleta (`Ctrl+K`).
   *
   * A busca acontece **no servidor** a cada tecla, e não sobre a árvore em memória: a árvore é de
   * uma publicação, e quem aperta `Ctrl+K` procurando "juros" quer a questão esteja ela onde
   * estiver. Filtrar em memória responderia rápido a pergunta errada.
   */
  const [found, setFound] = useState<readonly { id: string; title: string; hint: string }[]>([]);
  const router = useRouter();

  /**
   * A proposta pendente — uma de cada vez.
   *
   * Revisar duas propostas concorrentes sobre a mesma questão é revisar um diff contra um estado
   * que a outra vai mudar. Quando o agente propõe mais de uma coisa no mesmo turno, a primeira é
   * a que vale, e as outras voltam se ele for perguntado de novo.
   */
  const [proposal, setProposal] = useState<{
    summary: string;
    warnings: readonly string[];
    changes: readonly Change[];
    patch: unknown;
  } | null>(null);

  /** Anexa recusando com mensagem em vez de estourar o teto em silêncio. */
  const attachToAgent = useCallback((item: Parameters<typeof attach>[1]) => {
    setAgentContext((current) => {
      try {
        setAgentError(null);
        return attach(current, item);
      } catch (problem) {
        setAgentError(
          problem instanceof ContextTooLargeError ? problem.message : "Não deu para anexar.",
        );
        return current;
      }
    });
  }, []);

  const allNodes = useMemo(() => nest(nodes, unsavedQuestionId), [nodes, unsavedQuestionId]);

  const searchArchive = useCallback((text: string) => {
    // Menos de três letras não busca: "a" casaria com o acervo inteiro, e a resposta seria uma
    // lista que não ajuda a escolher.
    if (text.trim().length < 3) {
      setFound([]);
      return;
    }

    void fetch(`/api/search?q=${encodeURIComponent(text.trim())}&limit=8`)
      .then((response) => response.json() as Promise<{ hits?: SearchHit[] }>)
      .then((payload) =>
        setFound(
          (payload.hits ?? []).map((hit) => ({
            id: hit.id,
            title: hit.title === "(sem apelido)" ? hit.excerpt.slice(0, 60) : hit.title,
            hint: [hit.board, hit.year].filter(Boolean).join(" · ") || hit.type,
          })),
        ),
      )
      .catch(() => setFound([]));
  }, []);

  /** `kind` não está no `TreeNode` do DS — o mapa de id para tipo faz a ponte. */
  const kindById = useMemo(() => new Map(nodes.map((node) => [node.id, node.kind])), [nodes]);

  const kindsPresent = useMemo(() => [...new Set(nodes.map((node) => node.kind))].sort(), [nodes]);

  const tagsById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node.question?.tags ?? []])),
    [nodes],
  );

  /**
   * As tags presentes, com a contagem do **conjunto visível**.
   *
   * Do visível e não do acervo: o número serve para decidir se vale clicar naquela tag agora, e
   * um total global diria "300" numa publicação onde três questões a têm.
   */
  const tagsPresent = useMemo(
    () => countTags(nodes.filter((node) => node.question !== null).map((node) => node.question!)),
    [nodes],
  );

  const problemById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node.hasProblem])),
    [nodes],
  );

  const filtering = query.trim() !== "" || kindFilter !== "" || tagFilter.length > 0 || problemOnly;

  const filtered = useMemo(() => {
    // Os dois filtros num predicado só: `filterTree` aceita um, e encadear duas passagens
    // recortaria a árvore duas vezes — a segunda sobre galhos que a primeira já podou.
    const byKind = (node: TreeNode) => kindFilter === "" || kindById.get(node.id) === kindFilter;
    const byTag = (node: TreeNode) => matchesAllTags(tagsById.get(node.id) ?? [], tagFilter);
    // Do DTO e não do selo escolhido: a questão inválida **sendo editada** aparece como "não
    // salva", e derivar o filtro do rótulo a esconderia justamente do filtro que a procura.
    const byProblem = (node: TreeNode) => !problemOnly || problemById.get(node.id) === true;

    return filterTree(allNodes, {
      query,
      ...(kindFilter !== "" || tagFilter.length > 0 || problemOnly
        ? { predicate: (node: TreeNode) => byKind(node) && byTag(node) && byProblem(node) }
        : {}),
    });
  }, [allNodes, query, kindFilter, kindById, tagFilter, tagsById, problemOnly, problemById]);

  const treeNodes = filtering ? filtered.nodes : allNodes;
  // Um nó guardado pode ter sido excluído entre sessões: cair no primeiro é melhor que abrir
  // vazio sem explicar por quê.
  const selected = nodes.find((n) => n.id === selectedId) ?? nodes[0] ?? null;

  /**
   * Manda a pergunta e o contexto para o servidor, que tem a chave e as tools.
   *
   * A pergunta do usuário entra na conversa **antes** da resposta chegar: uma requisição que
   * demora vinte segundos com a tela em branco parece travada, e a pergunta na tela é o que diz
   * que ela foi recebida.
   */
  const askAgent = useCallback(
    async (prompt: string) => {
      const mine = `u-${prompt.length}-${agentTurns.length}`;
      setAgentTurns((turns) => [...turns, { id: mine, role: "user", text: prompt }]);
      setAgentBusy(true);
      setAgentError(null);

      try {
        const response = await fetch("/api/agents/ask", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            prompt,
            mode: agentMode,
            questionId: selected?.question?.id ?? null,
            context: agentContext.items,
          }),
        });

        const payload = (await response.json()) as {
          answer?: string;
          message?: string;
          toolCalls?: AgentTurn["toolCalls"];
          usage?: AgentTurn["usage"];
          error?: string | null;
          proposals?: {
            patch: unknown;
            summary: string;
            warnings: readonly string[];
            changes: readonly Change[];
          }[];
        };

        if (!response.ok) {
          // A pergunta do usuário fica na tela. Perder o que ele escreveu por causa de um
          // endpoint fora do ar seria cobrar dele o preço da nossa configuração.
          setAgentError(payload.message ?? "O agente não respondeu.");
          return;
        }

        // Só propostas que de fato mudam alguma coisa: um patch que reescreve o campo com o
        // mesmo texto viraria uma tela de revisão sem conteúdo.
        const first = payload.proposals?.find((entry) => entry.changes.length > 0);
        if (first) setProposal(first);

        setAgentTurns((turns) => [
          ...turns,
          {
            id: `a-${mine}`,
            role: "assistant",
            text: payload.answer ?? payload.error ?? "(sem resposta)",
            ...(payload.toolCalls ? { toolCalls: payload.toolCalls } : {}),
            ...(payload.usage ? { usage: payload.usage } : {}),
          },
        ]);
      } catch {
        setAgentError("Não deu para falar com o servidor.");
      } finally {
        setAgentBusy(false);
      }
    },
    [agentContext, agentMode, agentTurns.length, selected],
  );

  /**
   * Compila o antes e o depois de uma linha de LaTeX, para a revisão.
   *
   * Duas compilações em paralelo: o worker aguenta, e serializá-las dobraria a espera de quem só
   * quer ver se a mudança quebrou a questão.
   */
  const previewChange = useCallback(
    async (change: { id: string; before: string; after: string }) => {
      const questionId = selected?.question?.id;
      const field = change.id.startsWith("field:") ? change.id.slice("field:".length) : null;
      if (!questionId || field === null) throw new Error("Esta linha não é um campo de texto.");

      const compile = async (value: string) => {
        const response = await fetch("/api/agents/candidate-render", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ questionId, field, value }),
        });
        const payload = (await response.json()) as {
          png?: string | null;
          success?: boolean;
          diagnostics?: { severity: string; message: string }[];
          message?: string;
        };

        return {
          png: payload.png ?? null,
          success: payload.success ?? false,
          diagnostics: payload.diagnostics ?? [
            { severity: "error", message: payload.message ?? "" },
          ],
        };
      };

      const [before, after] = await Promise.all([compile(change.before), compile(change.after)]);
      return { before, after };
    },
    [selected],
  );

  /** Aplica só o que foi marcado. O servidor recalcula o diff e recusa se nada sobrou. */
  const applyProposal = useCallback(
    async (approvedChangeIds: readonly string[]) => {
      const questionId = selected?.question?.id;
      if (!questionId || !proposal) return;

      setAgentBusy(true);
      try {
        const response = await fetch("/api/agents/patches/apply", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ questionId, approvedChangeIds, patch: proposal.patch }),
        });
        const payload = (await response.json()) as {
          message?: string;
          revisionNumber?: number;
          stale?: string[];
        };

        if (!response.ok) {
          setAgentError(payload.message ?? "Não deu para aplicar.");
          return;
        }

        setProposal(null);
        setAgentTurns((turns) => [
          ...turns,
          {
            id: `sys-${turns.length}`,
            role: "assistant",
            text:
              `Aplicado. Revisão ${payload.revisionNumber} guarda o estado anterior.` +
              (payload.stale?.length
                ? ` ${payload.stale.length} mudança(s) já não existiam e foram ignoradas.`
                : ""),
          },
        ]);
        // A árvore **e** o editor: sem o refresh, a tela mostraria o estado velho. O editor
        // volta pelo `key` (ver `NodeDetail`), que muda junto com a versão que o servidor mandou.
        router.refresh();
      } catch {
        setAgentError("Não deu para falar com o servidor.");
      } finally {
        setAgentBusy(false);
      }
    },
    [proposal, router, selected],
  );

  const titleOf = useCallback(
    (nodeId: string) => nodes.find((n) => n.id === nodeId)?.title ?? "este nó",
    [nodes],
  );

  /**
   * Vizinhos imediatos na ordem visível, para o Alt+↑/↓.
   *
   * "Irmão" aqui é quem tem a mesma profundidade **e** o mesmo pai. Como o DTO não expõe
   * `parentId` (auditoria §40), o pai é o nó anterior de profundidade menor — a lista vem em
   * pré-ordem, então isso é exato.
   */
  const siblingOrderOf = useCallback(
    (nodeId: string) => {
      const index = nodes.findIndex((n) => n.id === nodeId);
      const node = nodes[index];
      if (!node) return {};

      const parentAt = (i: number): number => {
        for (let j = i - 1; j >= 0; j--)
          if ((nodes[j]?.depth ?? 0) < (nodes[i]?.depth ?? 0)) return j;
        return -1;
      };
      const parent = parentAt(index);

      const siblings = nodes
        .map((n, i) => ({ n, i }))
        .filter(({ n, i }) => n.depth === node.depth && parentAt(i) === parent)
        .map(({ n }) => n.id);

      const at = siblings.indexOf(nodeId);
      return {
        ...(at > 0 ? { previous: siblings[at - 1] as string } : {}),
        ...(at >= 0 && at < siblings.length - 1 ? { next: siblings[at + 1] as string } : {}),
      };
    },
    [nodes],
  );

  /**
   * O nó e tudo abaixo dele, na ordem visível.
   *
   * A lista vem em pré-ordem, então a descendência é o bloco contíguo logo depois do nó, enquanto
   * a profundidade for maior. Sem `parentId` no DTO (auditoria §40), é assim que se conhece o
   * ramo — e é o que permite recusar o drop dentro dele **antes** de largar.
   */
  const subtreeOf = useCallback(
    (nodeId: string): readonly string[] => {
      const start = nodes.findIndex((n) => n.id === nodeId);
      if (start === -1) return [];

      const baseDepth = nodes[start]?.depth ?? 0;
      const ids = [nodeId];
      for (let i = start + 1; i < nodes.length; i++) {
        const node = nodes[i];
        if (!node || node.depth <= baseDepth) break;
        ids.push(node.id);
      }
      return ids;
    },
    [nodes],
  );

  const editing = useTreeEditing({
    publicationId,
    titleOf,
    siblingOrderOf,
    onSelect: setSelectedId,
  });

  const menuFor = useCallback(
    (nodeId: string): readonly (readonly ContextMenuItem[])[] => [
      [
        {
          id: "child",
          label: "Novo nó filho",
          icon: "plus",
          shortcut: "Ctrl+Shift+N",
          onSelect: () => editing.handleCommand({ kind: "createChild", nodeId }),
        },
        {
          id: "sibling",
          label: "Novo irmão",
          icon: "plus",
          shortcut: "Ctrl+N",
          onSelect: () => editing.handleCommand({ kind: "createSibling", nodeId }),
        },
      ],
      [
        {
          id: "rename",
          label: "Renomear",
          icon: "pencil",
          shortcut: "F2",
          onSelect: () => editing.handleCommand({ kind: "rename", nodeId }),
        },
        {
          id: "duplicate",
          label: "Duplicar",
          icon: "history",
          shortcut: "Ctrl+D",
          onSelect: () => editing.handleCommand({ kind: "duplicate", nodeId }),
        },
      ],
      [
        {
          id: "delete",
          label: "Excluir",
          icon: "circle-x",
          shortcut: "Del",
          tone: "danger",
          onSelect: () => editing.handleCommand({ kind: "delete", nodeId }),
        },
      ],
    ],
    [editing],
  );

  const commands: readonly Command[] = useMemo(
    () => [
      ...nodes.map((node) => ({
        id: node.id,
        label: node.title,
        icon: KIND_ICONS[node.kind] ?? "file-text",
        hint: node.kind,
        group: "Ir para",
        onSelect: () => setSelectedId(node.id),
      })),
      // Grupo próprio: os nós desta publicação e as questões do acervo respondem a perguntas
      // diferentes, e misturá-los faria "Ir para" mentir sobre o que a seleção faz.
      ...found
        .filter((hit) => !nodes.some((node) => node.question?.id === hit.id))
        .map((hit) => ({
          id: `found-${hit.id}`,
          label: hit.title,
          icon: "search" as const,
          hint: hit.hint,
          group: "No acervo",
          // Sem ação por enquanto: navegar até outra publicação exige a rota de questão avulsa,
          // que não existe. Mostrar sem navegar é honesto; navegar para lugar nenhum não seria.
        })),
    ],
    [found, nodes, setSelectedId],
  );

  const breadcrumb = [
    { label: "Publicações", href: "/" },
    { label: publicationTitle },
    ...(selected ? [{ label: selected.title }] : []),
  ];

  return (
    <Workbench
      modules={MODULES}
      activeModule="publicacoes"
      breadcrumb={breadcrumb}
      commands={commands}
      onCommandQueryChange={searchArchive}
      searchLabel="Buscar nós e questões…"
      sidebarTitle="Árvore"
      sidebar={
        <>
          <div
            style={{
              display: "flex",
              gap: "var(--space-2)",
              marginBottom: "var(--space-2)",
            }}
          >
            <Input
              size="sm"
              placeholder="Filtrar a árvore…"
              aria-label="Filtrar a árvore"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Select
              size="sm"
              aria-label="Filtrar por tipo"
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value)}
              style={{ width: "9rem" }}
            >
              <option value="">Todos os tipos</option>
              {kindsPresent.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </Select>
            <Button
              size="sm"
              variant={problemOnly ? "primary" : "ghost"}
              aria-pressed={problemOnly}
              // Render quebrado **ou** questão inválida: são as duas coisas que impedem a prova
              // de sair, e separá-las em dois filtros faria procurar duas vezes pelo mesmo motivo.
              title="Só questões com render quebrado ou validação falhando"
              onClick={() => setProblemOnly((current) => !current)}
            >
              Com problema
            </Button>
          </div>

          {tagsPresent.length > 0 && (
            <div
              style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "0 var(--space-3)" }}
              role="group"
              aria-label="Filtrar por tag"
            >
              {tagsPresent.map((tag) => {
                const on = tagFilter.some((name) => sameTag(name, tag.name));

                // Selecionar a segunda tag **estreita**: `matchesAllTags` exige todas. Com "ou",
                // a segunda ampliaria o resultado — o contrário do que se acabou de pedir.
                const toggle = () =>
                  setTagFilter((current) =>
                    on
                      ? current.filter((name) => !sameTag(name, tag.name))
                      : [...current, tag.name],
                  );

                return (
                  <Chip
                    key={tag.name}
                    selected={on}
                    // O `Chip` é um `span`: sem estes três, o filtro por tag só existiria para
                    // quem usa mouse — e `aria-pressed` é o que diz ao leitor de tela que ele
                    // está ligado, coisa que a cor de fundo sozinha não conta.
                    role="button"
                    tabIndex={0}
                    aria-pressed={on}
                    style={{ cursor: "pointer" }}
                    onClick={toggle}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      toggle();
                    }}
                  >
                    {tag.name} · {tag.count}
                  </Chip>
                );
              })}
            </div>
          )}

          {filtering && (
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-meta)",
                color: "var(--text-muted)",
                padding: "0 var(--space-1) var(--space-2)",
              }}
            >
              {filtered.matchCount === 0
                ? "nenhum resultado"
                : `${filtered.matchCount} de ${nodes.length}`}
            </div>
          )}

          {treeNodes.length === 0 ? (
            filtering ? (
              <EmptyState
                icon="search"
                title="Nada encontrado"
                description="Ajuste o texto ou limpe o filtro de tipo."
              />
            ) : (
              <EmptyState
                icon="list-tree"
                title="Publicação sem conteúdo"
                description="Importe do acervo legado ou crie o primeiro capítulo."
              />
            )
          ) : (
            <TreeDnd subtreeOf={subtreeOf} onMove={editing.move}>
              <Tree
                nodes={treeNodes}
                selected={selected?.id}
                onSelect={setSelectedId}
                onCommand={editing.handleCommand}
                editingId={editing.editingId}
                onEditCommit={editing.rename}
                onEditCancel={editing.cancelEditing}
                wrapItem={(node, row) => (
                  <ContextMenu key={node.id} groups={menuFor(node.id)}>
                    <DraggableTreeRow nodeId={node.id}>{row}</DraggableTreeRow>
                  </ContextMenu>
                )}
                // Raízes abertas na primeira visita: uma árvore que abre com uma linha só não
                // mostra que existe conteúdo embaixo. Depois disso o que vale é o que ficou salvo.
                defaultExpanded={treeNodes.map((node) => node.id)}
                storageKey={`lbb:tree:${publicationTitle}`}
                aria-label={`Árvore de ${publicationTitle}`}
                // Filtrando, os expandidos passam a ser controlados: são os ancestrais dos
                // resultados. Sem isso, o filtro mostraria só as raízes e pareceria vazio.
                {...(filtering ? { expanded: filtered.expanded } : {})}
              />
            </TreeDnd>
          )}
        </>
      }
      actions={
        <Button
          size="sm"
          variant="primary"
          icon="plus"
          disabled={editing.busy}
          onClick={() =>
            void editing.create(
              selectedId
                ? { kind: "after", siblingId: selectedId }
                : { kind: "lastChild", parentId: null },
            )
          }
        >
          Novo nó
        </Button>
      }
      asideTitle="Agente"
      aside={
        <AgentPanel
          context={agentContext}
          onDetach={(id) => setAgentContext(detach(agentContext, id))}
          onClear={() => setAgentContext(clearContext())}
          providerLabel={ai?.providerLabel ?? null}
          model={ai?.model ?? null}
          error={agentError}
          turns={agentTurns}
          busy={agentBusy}
          proposal={proposal}
          mode={agentMode}
          onModeChange={setAgentMode}
          onApplyProposal={(ids) => void applyProposal(ids)}
          onRejectProposal={() => setProposal(null)}
          {...(ai && selected?.question
            ? {
                onPreviewChange: previewChange,
              }
            : {})}
          onRequestRevision={(feedback) => {
            // A proposta sai da tela e o feedback vira a próxima pergunta: revisar uma proposta
            // que o agente já foi convidado a substituir é revisar o que vai ser descartado.
            setProposal(null);
            void askAgent(feedback);
          }}
          {...(ai ? { onSend: (prompt: string) => void askAgent(prompt) } : {})}
        />
      }
      statusLeft={
        <>
          <span>SQLite · local</span>
          <span>
            {nodes.length} {nodes.length === 1 ? "nó" : "nós"}
          </span>
        </>
      }
      statusRight={<span>Fase 1 · shell</span>}
    >
      <>
        {editing.error && (
          <div style={{ padding: "var(--space-4) var(--space-7) 0" }}>
            <Banner tone="danger" title={editing.error.title} onDismiss={editing.dismissError}>
              {editing.error.message}
            </Banner>
          </div>
        )}

        {selected ? (
          <NodeDetail
            node={selected}
            publisher={publisher}
            publicationId={publicationId}
            workspaceId={workspaceId}
            onDirtyChange={setUnsavedQuestionId}
            {...(ai
              ? { onAttachSelection: (selection) => attachToAgent(selectionItem(selection)) }
              : {})}
          />
        ) : null}

        <Modal
          open={editing.pendingDelete !== null}
          onClose={editing.cancelDelete}
          // Descartar por clique fora não serve para confirmação de exclusão: o gesto ambíguo
          // vira "não fiz nada" na cabeça do usuário, e aqui o "não" precisa ser explícito.
          closeOnScrim={false}
          eyebrow="EXCLUIR"
          title={`Excluir “${editing.pendingDeleteTitle ?? ""}”?`}
          footer={
            <>
              <Button variant="ghost" onClick={editing.cancelDelete}>
                Cancelar
              </Button>
              <Button variant="danger" onClick={() => void editing.confirmDelete()}>
                Excluir
              </Button>
            </>
          }
        >
          A exclusão é lógica e leva junto <strong>tudo que está abaixo deste nó</strong>. Restaurar
          este nó traz a descendência de volta junto.
        </Modal>
      </>
    </Workbench>
  );
}

function NodeDetail({
  node,
  publisher,
  publicationId,
  workspaceId,
  onDirtyChange,
  onAttachSelection,
}: {
  node: TreeNodeDto;
  publisher: string | null;
  publicationId: string;
  workspaceId: string;
  /** Sobe o id da questão com alteração pendente, ou `null`. É o indicador "não salva". */
  onDirtyChange: (questionId: string | null) => void;
  /** Ausente quando não há IA configurada — sem endpoint, o botão de anexar não faz sentido. */
  onAttachSelection?: (selection: EditorSelection) => void;
}) {
  return (
    <>
      <PageHeader
        eyebrow={node.originalLabel ? `${node.kind} · ${node.originalLabel}` : node.kind}
        title={node.title}
        status={<ArtifactStatus status={node.question ? "unvalidated" : "draft"} size="sm" />}
        meta={
          node.question
            ? [node.question.difficultyLabel, node.question.source].filter(Boolean).join(" · ")
            : (publisher ?? undefined)
        }
      />

      <div style={{ padding: "0 var(--space-7) var(--space-8)", maxWidth: "min(100%, 96rem)" }}>
        {node.question ? (
          <>
            <div
              style={{
                height: "34rem",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-md)",
                overflow: "hidden",
              }}
            >
              <QuestionEditor
                /**
                 * A `key` leva a **versão do servidor**, e é isso que faz o editor recarregar
                 * quando um patch do agente muda a questão por baixo dele: o estado é semeado no
                 * mount, então sem remontar o texto na tela continuaria o de antes — e quem
                 * seguisse digitando estaria editando sobre uma base que já mudou.
                 *
                 * Não remonta ao digitar: o autosave grava, mas **não** refaz o render do
                 * servidor, então este `version` só muda quando algo de fora mexeu na questão.
                 * Fosse a cada gravação, o Monaco perderia o cursor no meio da frase.
                 */
                key={`${node.question.id}:${node.question.version}`}
                publicationId={publicationId}
                workspaceId={workspaceId}
                onDirtyChange={onDirtyChange}
                questionId={node.question.id}
                initialVersion={node.question.version}
                initial={{
                  statementLatex: node.question.statementLatex,
                  solutionLatex: node.question.solutionLatex,
                  complementLatex: node.question.complementLatex,
                }}
                {...(onAttachSelection ? { onAttachSelection } : {})}
                options={node.question.options.map((option) => ({
                  statementLatex: option.statementLatex,
                  isCorrect: option.isCorrect,
                }))}
              />
            </div>
          </>
        ) : (
          <EmptyState
            icon="file-text"
            title="Nó estrutural"
            description="Capítulos e seções ganham conteúdo próprio no editor, na Fase 3."
          />
        )}
      </div>
    </>
  );
}
