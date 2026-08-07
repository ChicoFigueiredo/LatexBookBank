"use client";

import { useEffect, useId, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";

import { IconButton } from "../forms/IconButton";
import { injectCss } from "../shared/inject-css";

const CSS = `
.lbb-scrim{position:fixed;inset:0;background:var(--scrim);z-index:var(--z-modal);display:flex;align-items:flex-start;justify-content:center;padding:10vh 24px 24px}
.lbb-modal{width:480px;max-width:100%;max-height:80vh;display:flex;flex-direction:column;background:var(--surface-overlay);border:1px solid var(--border-default);border-radius:var(--radius-lg);box-shadow:var(--shadow-lg);overflow:hidden}
.lbb-modal-head{display:flex;align-items:flex-start;gap:10px;padding:16px 16px 0 20px}
.lbb-modal-titles{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.lbb-modal-eyebrow{font-family:var(--font-mono);font-size:var(--text-micro);font-weight:var(--weight-medium);letter-spacing:var(--tracking-wide);text-transform:uppercase;color:var(--text-secondary)}
.lbb-modal-title{font-family:var(--font-display);font-size:var(--text-section);font-weight:var(--weight-bold);color:var(--text-strong);margin:0;line-height:var(--leading-tight)}
.lbb-modal-body{padding:14px 20px;overflow-y:auto;font-size:var(--text-body);color:var(--text-primary);line-height:var(--leading-normal)}
.lbb-modal-foot{display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:1px solid var(--border-subtle);background:var(--surface-raised)}
`;

const FOCUSABLE =
  'a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])';

export interface ModalProps {
  readonly open: boolean;
  readonly onClose?: () => void;
  /** Rótulo mono acima do título — "QUESTÃO 42", "IMPORTAÇÃO", "PATCH DO AGENTE". */
  readonly eyebrow?: ReactNode;
  readonly title: ReactNode;
  readonly footer?: ReactNode;
  readonly closeOnScrim?: boolean;
  readonly width?: number;
  readonly children?: ReactNode;
}

/**
 * Diálogo modal com foco preso, Escape para fechar, scroll travado e foco devolvido a quem abriu.
 *
 * A prisão de foco não é enfeite de acessibilidade: as decisões que passam por aqui são
 * destrutivas ou irreversíveis — excluir nó, aplicar patch do agente, sobrescrever na importação.
 * Um Tab que escapa para a árvore atrás do scrim deixa o usuário agindo sobre a tela errada com
 * um diálogo aberto pedindo confirmação.
 *
 * `closeOnScrim` existe justamente para poder ser **desligado** nesses casos: clicar fora não
 * deve ser um jeito silencioso de descartar um patch em revisão.
 */
export function Modal({
  open,
  onClose,
  eyebrow,
  title,
  footer,
  closeOnScrim = true,
  width = 480,
  children,
}: ModalProps) {
  injectCss("lbb-modal-css", CSS);
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    const opener = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Um tick depois: no primeiro paint o conteúdo do diálogo ainda pode não estar montado, e
    // focar cedo demais deixaria o foco no `<body>` — fora da prisão.
    const timer = setTimeout(() => {
      const first = ref.current?.querySelector<HTMLElement>(FOCUSABLE);
      if (first) first.focus();
      else ref.current?.focus();
    }, 0);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, [open]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose?.();
      return;
    }
    if (event.key !== "Tab" || !ref.current) return;

    const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  if (!open) return null;

  return (
    <div className="lbb-scrim" onMouseDown={closeOnScrim ? onClose : undefined}>
      <div
        ref={ref}
        className="lbb-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{ width }}
        tabIndex={-1}
        // O mousedown do diálogo não pode chegar ao scrim: um arraste de seleção de texto que
        // termina fora fecharia o diálogo e perderia o que estava sendo revisado.
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="lbb-modal-head">
          <div className="lbb-modal-titles">
            {eyebrow && <span className="lbb-modal-eyebrow">{eyebrow}</span>}
            <h2 className="lbb-modal-title" id={titleId}>
              {title}
            </h2>
          </div>
          <IconButton icon="x" size="sm" aria-label="Fechar" onClick={onClose} />
        </div>
        <div className="lbb-modal-body">{children}</div>
        {footer && <div className="lbb-modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
