"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { Icon, type IconName } from "../Icon";
import { IconButton } from "../forms/IconButton";
import { injectCss } from "../shared/inject-css";

const CSS = `
.lbb-toasts{position:fixed;right:16px;bottom:calc(var(--footer-h) + 12px);z-index:var(--z-toast);display:flex;flex-direction:column;gap:8px;width:340px;max-width:calc(100vw - 32px)}
.lbb-toast{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:var(--surface-overlay);border:1px solid var(--border-default);border-left:2px solid;border-radius:var(--radius-md);box-shadow:var(--shadow-md);font-size:var(--text-body)}
@media (prefers-reduced-motion: no-preference){.lbb-toast{animation:lbb-toast-in var(--motion-normal) var(--ease-standard)}}
@keyframes lbb-toast-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.lbb-toast-body{flex:1;min-width:0}
.lbb-toast-title{font-weight:var(--weight-medium);color:var(--text-strong)}
.lbb-toast-desc{color:var(--text-secondary);font-size:var(--text-body-sm);margin-top:1px}
`;

const TONES = {
  info: { icon: "circle-alert", fg: "var(--info)" },
  ok: { icon: "circle-check", fg: "var(--ok)" },
  warn: { icon: "triangle-alert", fg: "var(--warn)" },
  danger: { icon: "triangle-alert", fg: "var(--danger)" },
  ai: { icon: "sparkles", fg: "var(--ai)" },
} as const satisfies Record<string, { icon: IconName; fg: string }>;

export type ToastTone = keyof typeof TONES;

export interface ToastProps {
  readonly tone?: ToastTone;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly onDismiss?: () => void;
}

/**
 * Confirmação efêmera — "Questão salva", "Render em fila", "Backup concluído".
 *
 * Só serve para o que o usuário pode ignorar sem prejuízo. Erro que exige decisão vai para
 * `Banner` ou `Modal`: um toast some sozinho, e o que some sozinho não pode ser a única vez que o
 * sistema avisou (spec §22).
 */
export function Toast({ tone = "ok", title, description, onDismiss }: ToastProps) {
  injectCss("lbb-toast-css", CSS);
  const t = TONES[tone];

  return (
    <div className="lbb-toast" role="status" style={{ borderLeftColor: t.fg }}>
      <span style={{ color: t.fg, display: "flex", marginTop: 1 }}>
        <Icon name={t.icon} size={15} />
      </span>
      <div className="lbb-toast-body">
        <div className="lbb-toast-title">{title}</div>
        {description && <div className="lbb-toast-desc">{description}</div>}
      </div>
      {onDismiss && <IconButton icon="x" size="sm" aria-label="Dispensar" onClick={onDismiss} />}
    </div>
  );
}

export interface ToastRequest {
  readonly tone?: ToastTone;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  /** Milissegundos até sumir. `0` mantém até dispensa manual. Default: 4500. */
  readonly duration?: number;
}

interface ToastItem extends ToastRequest {
  readonly id: number;
}

export interface ToastController {
  readonly items: readonly ToastItem[];
  readonly push: (toast: ToastRequest) => number;
  readonly dismiss: (id: number) => void;
}

/**
 * Fila de toasts. Uso: `const toasts = useToasts()` no shell, `<ToastViewport controller={toasts} />`
 * uma única vez, e `toasts.push(...)` de onde for.
 *
 * O id vem de um contador em `ref`, não de `Date.now()` nem de random: dois toasts disparados no
 * mesmo tick precisam de chaves distintas, ou o React reaproveita o nó e o segundo aviso substitui
 * o primeiro sem que ninguém o tenha lido.
 */
export function useToasts(): ToastController {
  const [items, setItems] = useState<readonly ToastItem[]>([]);
  const idRef = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (toast: ToastRequest) => {
      const id = ++idRef.current;
      setItems((list) => [...list, { ...toast, id }]);

      const ms = toast.duration ?? 4500;
      if (ms > 0) {
        const timer = setTimeout(() => {
          timers.current.delete(timer);
          dismiss(id);
        }, ms);
        timers.current.add(timer);
      }
      return id;
    },
    [dismiss],
  );

  // Sem isto, um timer pendente chamaria `setItems` depois da desmontagem — o aviso de update em
  // componente desmontado que aparece justamente ao navegar rápido entre questões.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  return { items, push, dismiss };
}

export interface ToastViewportProps {
  readonly controller: ToastController;
}

export function ToastViewport({ controller }: ToastViewportProps) {
  injectCss("lbb-toast-css", CSS);
  if (controller.items.length === 0) return null;

  return (
    <div className="lbb-toasts" aria-live="polite">
      {controller.items.map((t) => (
        <Toast
          key={t.id}
          {...(t.tone ? { tone: t.tone } : {})}
          title={t.title}
          {...(t.description ? { description: t.description } : {})}
          onDismiss={() => controller.dismiss(t.id)}
        />
      ))}
    </div>
  );
}
