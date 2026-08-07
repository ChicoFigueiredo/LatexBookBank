"use client";

import { useMemo, useState } from "react";

import {
  ArtifactStatus,
  Badge,
  Callout,
  EmptyState,
  PageHeader,
  Tree,
  Workbench,
  type Command,
  type IconName,
  type TreeNode,
  type WorkbenchModule,
} from "@/design-system";
import type { TreeNodeDto } from "@modules/document-tree/application/get-publication-tree";

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
  readonly publicationTitle: string;
  readonly publisher: string | null;
  readonly nodes: readonly TreeNodeDto[];
}

export function PublicationWorkbench({
  publicationTitle,
  publisher,
  nodes,
}: PublicationWorkbenchProps) {
  const [selectedId, setSelectedId] = useState<string | undefined>(nodes[0]?.id);

  const treeNodes = useMemo(() => nest(nodes), [nodes]);
  const selected = nodes.find((n) => n.id === selectedId) ?? null;

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
    [nodes],
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
        treeNodes.length === 0 ? (
          <EmptyState
            icon="list-tree"
            title="Publicação sem conteúdo"
            description="Importe do acervo legado ou crie o primeiro capítulo."
          />
        ) : (
          <Tree
            nodes={treeNodes}
            selected={selectedId}
            onSelect={setSelectedId}
            // Raízes abertas na primeira visita: uma árvore que abre com uma linha só não
            // mostra que existe conteúdo embaixo. Depois disso o que vale é o que ficou salvo.
            defaultExpanded={treeNodes.map((node) => node.id)}
            storageKey={`lbb:tree:${publicationTitle}`}
            aria-label={`Árvore de ${publicationTitle}`}
          />
        )
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
      {selected ? <NodeDetail node={selected} publisher={publisher} /> : null}
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
