"use client";

import { useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";

import { injectCss } from "../shared/inject-css";

const CSS = `
.lbb-divider{flex-shrink:0;width:7px;margin:0 -3px;cursor:col-resize;position:relative;z-index:10;background:transparent;border:none;padding:0;touch-action:none}
.lbb-divider::after{content:"";position:absolute;left:3px;top:0;bottom:0;width:1px;background:transparent;transition:background var(--motion-fast) var(--ease-standard)}
.lbb-divider:hover::after,.lbb-divider[data-dragging="true"]::after{background:var(--accent)}
.lbb-divider:focus-visible{outline:none}
.lbb-divider:focus-visible::after{background:var(--focus-ring);width:2px}
`;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Passo do teclado. 16 px move o suficiente para ser visível sem exigir dezenas de teclas. */
const STEP = 16;

export interface DividerProps {
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly defaultValue: number;
  readonly onChange: (value: number) => void;
  readonly label: string;
  /** Para divisórias à **esquerda** do painel que redimensionam: arrastar para a esquerda cresce. */
  readonly invert?: boolean;
}

/**
 * Window splitter WAI-ARIA: arrasta com o ponteiro, ←/→ movem 16 px, Home/End vão aos extremos,
 * Enter e duplo clique restauram o padrão.
 *
 * O teclado não é acessório: a spec §34 exige que a experiência de teclado nunca seja
 * sacrificada, e uma divisória que só responde ao mouse trava o layout para quem trabalha sem
 * ele — justamente no painel do editor, onde se passa o dia.
 *
 * O arraste usa **pointer capture** em vez de listeners em `window`. O original registrava
 * `pointermove`/`pointerup` globais dentro do handler; se o componente desmontasse no meio do
 * gesto — trocar de módulo com o botão pressionado — os listeners e o `cursor: col-resize` no
 * `body` ficavam para trás.
 */
export function Divider({
  value,
  min,
  max,
  defaultValue,
  onChange,
  label,
  invert = false,
}: DividerProps) {
  injectCss("lbb-divider-css", CSS);
  const [dragging, setDragging] = useState(false);
  const origin = useRef({ x: 0, value: 0 });

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    origin.current = { x: event.clientX, value };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const delta = event.clientX - origin.current.x;
    onChange(clamp(origin.current.value + (invert ? -delta : delta), min, max));
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    let delta = 0;
    switch (event.key) {
      case "ArrowRight":
        delta = STEP;
        break;
      case "ArrowLeft":
        delta = -STEP;
        break;
      case "Home":
        event.preventDefault();
        onChange(min);
        return;
      case "End":
        event.preventDefault();
        onChange(max);
        return;
      case "Enter":
        event.preventDefault();
        onChange(defaultValue);
        return;
      default:
        return;
    }
    event.preventDefault();
    onChange(clamp(value + (invert ? -delta : delta), min, max));
  };

  return (
    <div
      className="lbb-divider"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      data-dragging={dragging ? "true" : "false"}
      title={`${label} — arraste, ←/→, duplo clique restaura`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => onChange(defaultValue)}
      onKeyDown={handleKeyDown}
    />
  );
}
