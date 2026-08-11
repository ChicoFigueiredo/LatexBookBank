"use client";

import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
} from "@dnd-kit/core";
import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";

import { injectCss } from "@/design-system";
import type { Placement } from "@modules/document-tree/domain/tree-mutations";

/**
 * Arrastar e soltar na árvore.
 *
 * Fica **fora** do `Tree` de propósito. A árvore já sabe demais — teclado, foco, persistência —,
 * e drag-and-drop é a única coisa aqui que precisa conhecer a forma da árvore para decidir se o
 * gesto é legal. Entra pelo `wrapItem`, a mesma costura do menu de contexto.
 *
 * Três zonas por linha, calculadas da posição vertical do que está sendo arrastado:
 * o terço de cima é "antes", o de baixo é "depois", o miolo é "virar filho". É o vocabulário
 * completo de `Placement`, sem inventar gesto novo.
 */

const CSS = `
.lbb-dnd-row{position:relative;border-radius:var(--radius-md)}
.lbb-dnd-row[data-dragging="true"]{opacity:.4}
.lbb-dnd-row[data-zone="child"]{background:var(--accent-surface);outline:1px solid var(--accent);outline-offset:-1px}
.lbb-dnd-row[data-zone="before"]::before,
.lbb-dnd-row[data-zone="after"]::after{content:"";position:absolute;left:0;right:0;height:2px;background:var(--accent);border-radius:1px}
.lbb-dnd-row[data-zone="before"]::before{top:-1px}
.lbb-dnd-row[data-zone="after"]::after{bottom:-1px}
.lbb-dnd-row[data-zone="blocked"]{outline:1px solid var(--danger);outline-offset:-1px;cursor:not-allowed}
`;

export type Zone = "before" | "after" | "child" | "blocked";

export interface TreeDndProps {
  /** Descendentes de cada nó, incluindo ele — para recusar soltar dentro do próprio ramo. */
  readonly subtreeOf: (nodeId: string) => readonly string[];
  readonly onMove: (nodeId: string, placement: Placement) => void;
  readonly children: ReactNode;
}

interface DragState {
  readonly activeId: string;
  readonly overId: string | null;
  readonly zone: Zone | null;
}

const TreeDragStateContext = createContext<DragState | null>(null);

/**
 * Terço de cima "antes", terço de baixo "depois", miolo "vira filho".
 *
 * Exportada para teste: é a única aritmética do arquivo, e errar o limiar produz um gesto que
 * parece funcionar mas cai na zona errada — o tipo de coisa que ninguém percebe até reordenar
 * um capítulo e ele virar filho do vizinho.
 */
export const zoneFromOffset = (ratio: number): Zone =>
  ratio < 0.3 ? "before" : ratio > 0.7 ? "after" : "child";

/** Traduz zona + alvo em `Placement`. Exportada pelo mesmo motivo. */
export function placementFor(zone: Exclude<Zone, "blocked">, overId: string): Placement {
  return zone === "child"
    ? { kind: "lastChild", parentId: overId }
    : { kind: zone, siblingId: overId };
}

export function TreeDnd({ subtreeOf, onMove, children }: TreeDndProps) {
  injectCss("lbb-dnd-css", CSS);
  const [drag, setDrag] = useState<DragState | null>(null);

  // 5 px antes de começar a arrastar: sem isso, todo clique na linha vira um drag de zero pixel e
  // a seleção para de funcionar.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragMove = useCallback(
    (event: DragMoveEvent) => {
      const activeId = String(event.active.id);
      const overId = event.over ? String(event.over.id) : null;

      if (!overId || overId === activeId) {
        setDrag({ activeId, overId, zone: null });
        return;
      }

      // Recusa **durante** o arraste, não depois de soltar: a linha fica vermelha e o usuário vê
      // que não pode antes de largar. Uma rejeição só no servidor faria o nó pular de volta sem
      // explicação visível.
      if (subtreeOf(activeId).includes(overId)) {
        setDrag({ activeId, overId, zone: "blocked" });
        return;
      }

      const activeRect = event.active.rect.current.translated;
      const overRect = event.over?.rect;
      if (!activeRect || !overRect || overRect.height === 0) {
        setDrag({ activeId, overId, zone: null });
        return;
      }

      const ratio = (activeRect.top - overRect.top) / overRect.height;
      setDrag({ activeId, overId, zone: zoneFromOffset(ratio) });
    },
    [subtreeOf],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const current = drag;
      setDrag(null);

      const activeId = String(event.active.id);
      if (!current || current.activeId !== activeId) return;
      if (!current.overId || current.zone === null || current.zone === "blocked") return;

      onMove(activeId, placementFor(current.zone, current.overId));
    },
    [drag, onMove],
  );

  return (
    <DndContext
      sensors={sensors}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDrag(null)}
    >
      <TreeDragStateContext.Provider value={drag}>{children}</TreeDragStateContext.Provider>
    </DndContext>
  );
}

export interface DraggableTreeRowProps {
  readonly nodeId: string;
  readonly children: ReactNode;
}

/**
 * Envolve uma linha da árvore, tornando-a arrastável **e** alvo de soltura.
 *
 * O `<div>` recebe os listeners; o botão da linha continua intocado por dentro, então clique,
 * duplo clique e teclado seguem funcionando como antes.
 */
export function DraggableTreeRow({ nodeId, children }: DraggableTreeRowProps) {
  const drag = useContext(TreeDragStateContext);

  const draggable = useDraggable({ id: nodeId });
  const droppable = useDroppable({ id: nodeId });

  const isDragging = drag?.activeId === nodeId;
  const zone = drag?.overId === nodeId && !isDragging ? (drag.zone ?? undefined) : undefined;

  return (
    <div
      ref={(element) => {
        draggable.setNodeRef(element);
        droppable.setNodeRef(element);
      }}
      className="lbb-dnd-row"
      data-dragging={isDragging ? "true" : "false"}
      {...(zone ? { "data-zone": zone } : {})}
      {...draggable.listeners}
      {...draggable.attributes}
      // O `role` do dnd-kit é `button`, e ele viraria um segundo botão dentro do `treeitem`,
      // duplicando o nó para o leitor de tela. A linha já é o botão; este `div` é só o alvo.
      role="presentation"
      tabIndex={-1}
    >
      {children}
    </div>
  );
}
