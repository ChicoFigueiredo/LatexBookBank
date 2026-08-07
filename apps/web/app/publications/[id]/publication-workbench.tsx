"use client";

import { useCallback, useMemo, useState } from "react";

import {
  ArtifactStatus,
  Badge,
  Banner,
  Button,
  Callout,
  ContextMenu,
  EmptyState,
  Input,
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
import type { TreeNodeDto } from "@modules/document-tree/application/get-publication-tree";

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
function nest(flat: readonly TreeNodeDto[]): TreeNode[] {
  const roots: TreeNode[] = [];
  const stack: { depth: number; children: TreeNode[] }[] = [{ depth: -1, children: roots }];

  for (const dto of flat) {
    while (stack.length > 1 && (stack[stack.length - 1]?.depth ?? -1) >= dto.depth) stack.pop();

    const children: TreeNode[] = [];
    const node: TreeNode = {
      id: dto.id,
      label: dto.title,
      ...(KIND_ICONS[dto.kind] ? { icon: KIND_ICONS[dto.kind] as IconName } : {}),
      ...(dto.question ? { badge: `${dto.question.options.length}` } : {}),
      children,
    };

    stack[stack.length - 1]?.children.push(node);
    stack.push({ depth: dto.depth, children });
  }

  return roots;
}

export interface PublicationWorkbenchProps {
  readonly publicationId: string;
  readonly publicationTitle: string;
  readonly publisher: string | null;
  readonly nodes: readonly TreeNodeDto[];
}

export function PublicationWorkbench({
  publicationId,
  publicationTitle,
  publisher,
  nodes,
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

  const allNodes = useMemo(() => nest(nodes), [nodes]);

  /** `kind` não está no `TreeNode` do DS — o mapa de id para tipo faz a ponte. */
  const kindById = useMemo(() => new Map(nodes.map((node) => [node.id, node.kind])), [nodes]);

  const kindsPresent = useMemo(() => [...new Set(nodes.map((node) => node.kind))].sort(), [nodes]);

  const filtering = query.trim() !== "" || kindFilter !== "";

  const filtered = useMemo(
    () =>
      filterTree(allNodes, {
        query,
        ...(kindFilter
          ? { predicate: (node: TreeNode) => kindById.get(node.id) === kindFilter }
          : {}),
      }),
    [allNodes, query, kindFilter, kindById],
  );

  const treeNodes = filtering ? filtered.nodes : allNodes;
  // Um nó guardado pode ter sido excluído entre sessões: cair no primeiro é melhor que abrir
  // vazio sem explicar por quê.
  const selected = nodes.find((n) => n.id === selectedId) ?? nodes[0] ?? null;

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
    () =>
      nodes.map((node) => ({
        id: node.id,
        label: node.title,
        icon: KIND_ICONS[node.kind] ?? "file-text",
        hint: node.kind,
        group: "Ir para",
        onSelect: () => setSelectedId(node.id),
      })),
    [nodes, setSelectedId],
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
      searchLabel="Buscar nós…"
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
          </div>

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
        <div style={{ padding: "var(--space-4)" }}>
          <Callout tone="ai" title="Painel agêntico">
            Chega na Fase 8. Nada que o agente propuser entra no banco sem aprovação explícita.
          </Callout>
        </div>
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

        {selected ? <NodeDetail node={selected} publisher={publisher} /> : null}

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

function NodeDetail({ node, publisher }: { node: TreeNodeDto; publisher: string | null }) {
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

      <div style={{ padding: "0 var(--space-7) var(--space-8)", maxWidth: "56rem" }}>
        {node.question ? (
          <>
            <p style={{ whiteSpace: "pre-wrap" }}>{node.question.statementLatex}</p>

            {node.question.options.length > 0 && (
              <ul style={{ listStyle: "none", padding: 0, marginTop: "var(--space-4)" }}>
                {node.question.options.map((option) => (
                  <li
                    key={option.id}
                    style={{
                      display: "flex",
                      gap: "var(--space-2)",
                      alignItems: "baseline",
                      marginBottom: "var(--space-2)",
                    }}
                  >
                    {/* A letra vem da projeção, nunca do banco (spec §8.5). */}
                    <strong style={{ fontFamily: "var(--font-mono)" }}>{option.label})</strong>
                    <span style={{ flex: 1 }}>{option.statementLatex}</span>
                    {option.isCorrect && <Badge tone="ok">gabarito</Badge>}
                  </li>
                ))}
              </ul>
            )}
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
