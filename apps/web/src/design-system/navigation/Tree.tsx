"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";

import { Icon, type IconName } from "../Icon";
import { injectCss } from "../shared/inject-css";

const CSS = `
.lbb-tree{list-style:none;margin:0;padding:0;font-size:var(--text-body);user-select:none}
.lbb-tree ul{list-style:none;margin:0;padding:0}
.lbb-tree-row{position:relative;display:flex;align-items:center;gap:6px;height:28px;padding-right:8px;border:none;width:100%;background:transparent;color:var(--text-primary);font:inherit;border-radius:var(--radius-md);cursor:pointer;text-align:left;transition:background var(--motion-fast) var(--ease-standard)}
.lbb-tree-row:hover{background:var(--hover-overlay)}
.lbb-tree-row:focus-visible{outline:2px solid var(--focus-ring);outline-offset:-2px}
.lbb-tree-row[data-selected="true"]{background:var(--accent-surface);color:var(--accent-text);font-weight:var(--weight-medium)}
.lbb-tree-row[data-selected="true"] .lbb-tree-filete{position:absolute;left:0;top:5px;bottom:5px;width:2px;border-radius:1px;background:var(--accent)}
.lbb-tree-row[data-disabled="true"]{opacity:var(--disabled-opacity);cursor:not-allowed}
.lbb-tree-caret{display:flex;align-items:center;justify-content:center;width:18px;height:18px;flex-shrink:0;padding:0;border:0;background:transparent;color:var(--text-muted);cursor:pointer;transition:transform var(--motion-fast) var(--ease-standard)}
.lbb-tree-caret[data-open="true"]{transform:rotate(90deg)}
.lbb-tree-caret[data-leaf="true"]{visibility:hidden;pointer-events:none}
.lbb-tree-label{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lbb-tree-badge{font-family:var(--font-mono);font-size:var(--text-meta);color:var(--text-muted);flex-shrink:0}
.lbb-tree-edit{flex:1;min-width:0;height:20px;padding:0 4px;border:1px solid var(--accent);border-radius:var(--radius-sm);background:var(--surface);color:var(--text-primary);font:inherit;font-size:var(--text-body);outline:none}
.lbb-tree-group{position:relative;padding-left:14px;margin-left:8px}
.lbb-tree-group::before{content:"";position:absolute;left:0;top:0;bottom:0;width:1px;background:var(--border-subtle)}
`;

export interface TreeNode {
  readonly id: string;
  readonly label: ReactNode;
  readonly icon?: IconName;
  /** Contagem em mono à direita — questões no nó, alternativas, pendências. */
  readonly badge?: ReactNode;
  /** Tipicamente um `ArtifactStatus`: erro de render, patch pendente, não validada. */
  readonly status?: ReactNode;
  readonly disabled?: boolean;
  readonly children?: readonly TreeNode[];
}

interface FlatNode {
  readonly node: TreeNode;
  readonly depth: number;
}

/** Achata só o que está visível — é sobre essa lista que ↑↓ navegam. */
function flatten(
  nodes: readonly TreeNode[],
  expanded: readonly string[],
  depth = 0,
  out: FlatNode[] = [],
): FlatNode[] {
  for (const node of nodes) {
    out.push({ node, depth });
    if (node.children?.length && expanded.includes(node.id)) {
      flatten(node.children, expanded, depth + 1, out);
    }
  }
  return out;
}

interface PersistedTreeState {
  readonly expanded: readonly string[];
  readonly selected?: string | undefined;
}

/**
 * Os ancestrais de um nó, da raiz até o pai.
 *
 * Vazio quando o nó é raiz ou não está na árvore — os dois casos não pedem expansão nenhuma.
 */
function ancestorsOf(
  nodes: readonly TreeNode[],
  target: string,
  path: readonly string[] = [],
): readonly string[] {
  for (const node of nodes) {
    if (node.id === target) return path;

    if (node.children?.length) {
      // Achar sempre devolve pelo menos `[...path, node.id]` — o próprio pai. Uma lista vazia aqui
      // significa "não está neste ramo", e a busca continua nos irmãos.
      const found = ancestorsOf(node.children, target, [...path, node.id]);
      if (found.length > 0) return found;
    }
  }
  return [];
}

function readPersisted(storageKey: string | null): readonly string[] | null {
  if (!storageKey || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw == null) return null;
    const parsed: unknown = JSON.parse(raw);
    const expanded = (parsed as PersistedTreeState | null)?.expanded;
    return Array.isArray(expanded) ? (expanded as readonly string[]) : null;
  } catch {
    // localStorage indisponível (modo privado, quota, JSON corrompido). Perder a posição da
    // árvore é aceitável; derrubar a sidebar inteira por causa disso não é.
    return null;
  }
}

function writePersisted(storageKey: string | null, state: PersistedTreeState): void {
  if (!storageKey || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    /* idem */
  }
}

export interface TreeProps {
  readonly nodes: readonly TreeNode[];
  readonly selected?: string | undefined;
  /** Clique simples ou Space: muda o nó corrente. */
  readonly onSelect?: (id: string, node: TreeNode) => void;
  /** Duplo clique ou Enter: abre o nó no editor. */
  readonly onActivate?: (id: string, node: TreeNode) => void;
  readonly expanded?: readonly string[];
  readonly onExpandedChange?: (expanded: readonly string[]) => void;
  readonly defaultExpanded?: readonly string[];
  /** Chave de `localStorage`. Convenção: `lbb:tree:<escopo>`. */
  readonly storageKey?: string | null;
  readonly "aria-label"?: string;

  /**
   * Comandos de teclado, emitidos e não executados.
   *
   * A árvore não sabe criar nem excluir nada — ela reconhece o gesto e avisa. Confirmação de
   * exclusão, chamada de API e tratamento de erro são de quem consome, porque é lá que existe
   * `Modal`, rota e noção de o que o nó significa.
   */
  readonly onCommand?: (command: TreeCommand) => void;

  /** Nó em renomeação inline. Quem controla é o consumidor, junto com `onCommand`. */
  readonly editingId?: string | null;
  readonly onEditCommit?: (id: string, title: string) => void;
  readonly onEditCancel?: () => void;

  /**
   * Envolve cada linha — é por aqui que entra o `ContextMenu`, sem que a árvore precise conhecer
   * menus. A costura existe porque o Radix embrulha o gatilho, e o gatilho é a linha, que nasce
   * aqui dentro.
   */
  readonly wrapItem?: (node: TreeNode, row: ReactNode) => ReactNode;
}

/** Gestos que a árvore reconhece. O `nodeId` é sempre o nó focado quando a tecla foi apertada. */
export type TreeCommand =
  | { readonly kind: "rename"; readonly nodeId: string }
  | { readonly kind: "delete"; readonly nodeId: string }
  | { readonly kind: "duplicate"; readonly nodeId: string }
  | { readonly kind: "createChild"; readonly nodeId: string }
  | { readonly kind: "createSibling"; readonly nodeId: string }
  | { readonly kind: "moveUp"; readonly nodeId: string }
  | { readonly kind: "moveDown"; readonly nodeId: string };

/**
 * Campo de renomeação inline.
 *
 * Componente à parte porque precisa de estado próprio, e um `useState` dentro do `map` das
 * linhas não é possível. `autoFocus` + `select()` deixam o nome antigo inteiro marcado: o gesto
 * mais comum depois de F2 é substituir, não emendar.
 *
 * Enter aplica, Escape cancela, e sair do campo **aplica** — perder o que foi digitado por
 * clicar fora é o comportamento que faz alguém desistir de renomear.
 */
function RenameField({
  initial,
  onCommit,
  onCancel,
}: {
  readonly initial: string;
  readonly onCommit: (title: string) => void;
  readonly onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);

  return (
    <input
      className="lbb-tree-edit"
      value={value}
      autoFocus
      aria-label="Novo nome"
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onCommit(value.trim())}
      // O clique no campo não pode chegar à linha: selecionaria o nó e tiraria o foco daqui.
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        // A árvore inteira escuta setas, F2 e Delete. Sem isto, digitar um nome com "n" e Ctrl
        // solto, ou apertar Delete para apagar um caractere, dispararia comando na árvore.
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          onCommit(value.trim());
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
    />
  );
}

/**
 * Treeview WAI-ARIA: roving tabindex, ↑↓ nos visíveis, → expande/entra, ← colapsa/sobe,
 * Home/End, Space seleciona, Enter ativa.
 *
 * **Onde diverge do DS de origem:** lá, clicar na linha de um nó com filhos expandia/colapsava.
 * Aqui não pode: neste domínio um capítulo **é** conteúdo editável (`DocumentNode` com LaTeX
 * próprio), e não uma pasta. Se o clique expandisse, selecionar um capítulo exigiria alterar a
 * forma da árvore — e o usuário nunca conseguiria editá-lo sem mexer no que está vendo.
 * Expandir é do caret; a linha seleciona.
 *
 * A distinção selecionar × ativar é a mesma do explorador de arquivos de uma IDE: percorrer a
 * árvore com as setas não pode disparar carga de conteúdo a cada tecla.
 */
export function Tree({
  nodes,
  selected,
  onSelect,
  onActivate,
  expanded: expandedProp,
  onExpandedChange,
  defaultExpanded = [],
  storageKey = null,
  "aria-label": ariaLabel = "Árvore",
  onCommand,
  editingId = null,
  onEditCommit,
  onEditCancel,
  wrapItem,
}: TreeProps) {
  injectCss("lbb-tree-css", CSS);

  const [expandedState, setExpandedState] = useState<readonly string[]>(
    () => readPersisted(storageKey) ?? defaultExpanded,
  );
  const expanded = expandedProp ?? expandedState;

  // Foco por mapa de refs, não por `querySelector` com o id no seletor: `legacyId` e UUID podem
  // começar com dígito, e um seletor de atributo com id não escapado falha em silêncio — a tecla
  // simplesmente não faz nada.
  const rows = useRef(new Map<string, HTMLButtonElement>());
  const [focusId, setFocusId] = useState<string | null>(null);

  /**
   * Ramos que a pessoa fechou **apesar** de conterem o selecionado.
   *
   * Sem isto, revelar o caminho do selecionado tornava impossível fechá-lo: o clique no caret
   * gravava "fechado" e a revelação reabria no mesmo render — na tela, um caret que não faz nada.
   * Selecionar outro nó zera a lista, porque a decisão era sobre aquela seleção.
   */
  const [collapsedAnyway, setCollapsedAnyway] = useState<readonly string[]>([]);
  const [lastSelected, setLastSelected] = useState(selected);

  // Ajuste de estado no render, e não num efeito: é o padrão que o React documenta para "derivar
  // estado de uma prop que mudou", e evita a renderização em cascata que um efeito daria aqui.
  if (selected !== lastSelected) {
    setLastSelected(selected);
    setCollapsedAnyway([]);
  }

  /**
   * O caminho até o nó selecionado, sempre aberto.
   *
   * O caso que motiva: criar uma questão dentro de um grupo recém-criado. O grupo não estava na
   * lista de expandidos — ele acabou de nascer —, então a questão nascia selecionada e
   * **invisível**: o editor abria com ela, o cabeçalho a nomeava, e a árvore não mostrava linha
   * nenhuma. Vale igual para a busca global, que seleciona um nó em qualquer profundidade.
   *
   * Derivado no render, e não num efeito que chama `setExpanded`: um efeito daria uma renderização
   * em cascata e, pior, **gravaria** essa abertura no `localStorage` — a árvore voltaria aberta
   * amanhã por causa de um nó que a pessoa nem lembra de ter visitado. Aqui a abertura dura
   * enquanto a seleção durar; o que a pessoa abre com o mouse continua sendo o que fica guardado.
   */
  const revealed = useMemo(() => {
    if (selected === undefined) return expanded;

    const path = ancestorsOf(nodes, selected).filter(
      (id) => !expanded.includes(id) && !collapsedAnyway.includes(id),
    );
    return path.length === 0 ? expanded : [...expanded, ...path];
  }, [collapsedAnyway, expanded, nodes, selected]);

  const visible = useMemo(() => flatten(nodes, revealed), [nodes, revealed]);

  const persist = useCallback(
    (nextExpanded: readonly string[], nextSelected: string | undefined) => {
      writePersisted(storageKey, { expanded: nextExpanded, selected: nextSelected });
    },
    [storageKey],
  );

  const setExpanded = useCallback(
    (next: readonly string[]) => {
      if (expandedProp === undefined) setExpandedState(next);
      persist(next, selected);
      onExpandedChange?.(next);
    },
    [expandedProp, onExpandedChange, persist, selected],
  );

  const toggle = useCallback(
    (node: TreeNode) => {
      if (!node.children?.length) return;
      const fechando = revealed.includes(node.id);

      // Um ramo aberto **porque** contém o selecionado precisa fechar ao clique, e não reabrir no
      // render seguinte. O que entra no guardado é o resultado do gesto.
      setExpanded(
        fechando ? revealed.filter((id) => id !== node.id) : [...revealed, node.id],
      );

      setCollapsedAnyway((current) =>
        fechando
          ? current.includes(node.id)
            ? current
            : [...current, node.id]
          : current.filter((id) => id !== node.id),
      );
    },
    [revealed, setExpanded],
  );

  const focusRow = useCallback((id: string) => {
    setFocusId(id);
    rows.current.get(id)?.focus();
  }, []);

  const findParent = useCallback(
    (id: string): TreeNode | null => {
      // `null` cobre tanto "não achei" quanto "achei na raiz" — e nos dois casos não há para onde
      // subir, que é a única pergunta que ← faz.
      const walk = (list: readonly TreeNode[], parent: TreeNode | null): TreeNode | null => {
        for (const node of list) {
          if (node.id === id) return parent;
          if (node.children) {
            const found = walk(node.children, node);
            if (found) return found;
          }
        }
        return null;
      };
      return walk(nodes, null);
    },
    [nodes],
  );

  const select = useCallback(
    (node: TreeNode) => {
      if (node.disabled) return;
      onSelect?.(node.id, node);
      persist(expanded, node.id);
    },
    [expanded, onSelect, persist],
  );

  const handleKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    node: TreeNode,
    index: number,
  ) => {
    const isOpen = revealed.includes(node.id);
    const hasChildren = (node.children?.length ?? 0) > 0;

    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault();
        // Alt+↓ move o nó; ↓ sozinho só anda o foco. Sem o Alt, percorrer a árvore reordenaria
        // o acervo a cada tecla.
        if (event.altKey) {
          onCommand?.({ kind: "moveDown", nodeId: node.id });
          break;
        }
        const next = visible[index + 1];
        if (next) focusRow(next.node.id);
        break;
      }
      case "ArrowUp": {
        event.preventDefault();
        if (event.altKey) {
          onCommand?.({ kind: "moveUp", nodeId: node.id });
          break;
        }
        const previous = visible[index - 1];
        if (previous) focusRow(previous.node.id);
        break;
      }
      case "ArrowRight": {
        event.preventDefault();
        if (!hasChildren) break;
        if (!isOpen) toggle(node);
        else {
          const first = node.children?.[0];
          if (first) focusRow(first.id);
        }
        break;
      }
      case "ArrowLeft": {
        event.preventDefault();
        if (hasChildren && isOpen) toggle(node);
        else {
          const parent = findParent(node.id);
          if (parent) focusRow(parent.id);
        }
        break;
      }
      case "Home": {
        event.preventDefault();
        const first = visible[0];
        if (first) focusRow(first.node.id);
        break;
      }
      case "End": {
        event.preventDefault();
        const last = visible[visible.length - 1];
        if (last) focusRow(last.node.id);
        break;
      }
      case " ":
        event.preventDefault();
        select(node);
        break;
      case "Enter":
        event.preventDefault();
        if (node.disabled) break;
        select(node);
        onActivate?.(node.id, node);
        break;
      case "F2":
        event.preventDefault();
        onCommand?.({ kind: "rename", nodeId: node.id });
        break;
      case "d":
      case "D":
        // Ctrl+D é "adicionar favorito" no navegador. Aqui vale mais duplicar o nó, e o
        // `preventDefault` evita a barra de favoritos abrindo por cima da árvore.
        if (!event.ctrlKey && !event.metaKey) break;
        event.preventDefault();
        onCommand?.({ kind: "duplicate", nodeId: node.id });
        break;
      case "Delete":
        event.preventDefault();
        onCommand?.({ kind: "delete", nodeId: node.id });
        break;
      case "n":
      case "N":
        // Ctrl+N irmão, Ctrl+Shift+N filho (spec §4.1). `preventDefault` porque no navegador
        // Ctrl+N abre janela nova — e perder a árvore para uma janela em branco seria pior que
        // não ter o atalho.
        if (!event.ctrlKey && !event.metaKey) break;
        event.preventDefault();
        onCommand?.({
          kind: event.shiftKey ? "createChild" : "createSibling",
          nodeId: node.id,
        });
        break;
      default:
        break;
    }
  };

  // Exatamente uma linha na ordem de tabulação: a focada, senão a selecionada, senão a primeira.
  // Sem isto, Tab percorreria o acervo inteiro antes de chegar ao editor.
  const tabbableId =
    (focusId && visible.some((v) => v.node.id === focusId) ? focusId : null) ??
    (selected && visible.some((v) => v.node.id === selected) ? selected : null) ??
    visible[0]?.node.id;

  const renderLevel = (list: readonly TreeNode[], depth: number): ReactNode =>
    list.map((node) => {
      const hasChildren = (node.children?.length ?? 0) > 0;
      const isOpen = revealed.includes(node.id);
      const index = visible.findIndex((v) => v.node.id === node.id);
      if (index === -1) return null;

      const row = (
        <button
          type="button"
          className="lbb-tree-row"
          ref={(el) => {
            if (el) rows.current.set(node.id, el);
            else rows.current.delete(node.id);
          }}
          data-node-id={node.id}
          data-depth={depth}
          data-selected={node.id === selected ? "true" : "false"}
          data-disabled={node.disabled ? "true" : "false"}
          tabIndex={node.id === tabbableId ? 0 : -1}
          onKeyDown={(e) => handleKeyDown(e, node, index)}
          onFocus={() => setFocusId(node.id)}
          onClick={() => select(node)}
          onDoubleClick={() => {
            if (!node.disabled) onActivate?.(node.id, node);
          }}
        >
          <span className="lbb-tree-filete" aria-hidden="true" />
          <span
            className="lbb-tree-caret"
            role="presentation"
            data-open={isOpen ? "true" : "false"}
            data-leaf={hasChildren ? "false" : "true"}
            // O caret é o único gesto de expandir. `stopPropagation` impede que o clique nele
            // também selecione — expandir para espiar não deve trocar o que está no editor.
            onClick={(e) => {
              e.stopPropagation();
              toggle(node);
            }}
          >
            <Icon name="chevron-right" size={13} />
          </span>
          {node.icon && <Icon name={node.icon} size={14} />}
          {editingId === node.id ? (
            <RenameField
              initial={typeof node.label === "string" ? node.label : ""}
              onCommit={(title) => onEditCommit?.(node.id, title)}
              onCancel={() => onEditCancel?.()}
            />
          ) : (
            <span className="lbb-tree-label">{node.label}</span>
          )}
          {node.badge != null && <span className="lbb-tree-badge">{node.badge}</span>}
          {node.status}
        </button>
      );

      return (
        <li
          key={node.id}
          role="treeitem"
          {...(hasChildren ? { "aria-expanded": isOpen } : {})}
          aria-selected={node.id === selected}
          {...(node.disabled ? { "aria-disabled": true } : {})}
        >
          {wrapItem ? wrapItem(node, row) : row}
          {hasChildren && isOpen && (
            <ul role="group" className="lbb-tree-group">
              {renderLevel(node.children ?? [], depth + 1)}
            </ul>
          )}
        </li>
      );
    });

  return (
    <ul className="lbb-tree" role="tree" aria-label={ariaLabel}>
      {renderLevel(nodes, 0)}
    </ul>
  );
}
