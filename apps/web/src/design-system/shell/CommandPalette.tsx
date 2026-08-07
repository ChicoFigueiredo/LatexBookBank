"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import { Icon, type IconName } from "../Icon";
import { injectCss } from "../shared/inject-css";

const CSS = `
.lbb-pal-scrim{position:fixed;inset:0;background:var(--scrim);z-index:var(--z-palette);display:flex;align-items:flex-start;justify-content:center;padding-top:12vh}
.lbb-pal{width:560px;max-width:calc(100vw - 48px);background:var(--surface-overlay);border:1px solid var(--border-default);border-radius:var(--radius-lg);box-shadow:var(--shadow-lg);overflow:hidden;display:flex;flex-direction:column}
.lbb-pal-head{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--border-subtle);color:var(--text-muted)}
.lbb-pal-input{flex:1;border:none;outline:none;background:transparent;color:var(--text-primary);font:inherit;font-size:var(--text-body)}
.lbb-pal-input::placeholder{color:var(--text-muted)}
.lbb-pal-list{max-height:320px;overflow-y:auto;padding:6px}
.lbb-pal-group{font-family:var(--font-mono);font-size:var(--text-micro);font-weight:var(--weight-medium);letter-spacing:var(--tracking-wide);text-transform:uppercase;color:var(--text-muted);padding:8px 10px 4px}
.lbb-pal-item{display:flex;align-items:center;gap:10px;width:100%;padding:0 10px;height:36px;border:none;border-radius:var(--radius-md);background:transparent;color:var(--text-primary);font:inherit;font-size:var(--text-body);cursor:pointer;text-align:left}
.lbb-pal-item[data-sel="true"]{background:var(--accent-surface);color:var(--accent-text)}
.lbb-pal-item-icon{color:var(--text-muted);display:flex}
.lbb-pal-item[data-sel="true"] .lbb-pal-item-icon{color:var(--accent-text)}
.lbb-pal-item-label{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lbb-pal-hint{margin-left:auto;font-family:var(--font-mono);font-size:var(--text-meta);color:var(--text-muted)}
.lbb-pal-empty{padding:28px 16px;text-align:center;color:var(--text-secondary);font-size:var(--text-body)}
.lbb-pal-foot{display:flex;gap:14px;padding:8px 14px;border-top:1px solid var(--border-subtle);font-family:var(--font-mono);font-size:var(--text-micro);letter-spacing:var(--tracking-wide);text-transform:uppercase;color:var(--text-muted)}
.lbb-kbd{font-family:var(--font-mono);font-size:var(--text-micro);border:1px solid var(--border-default);border-radius:var(--radius-sm);background:var(--surface);padding:1px 5px;color:var(--text-muted);white-space:nowrap}
`;

const fold = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export interface Command {
  readonly id: string;
  readonly label: string;
  readonly icon?: IconName;
  /** Texto em mono à direita — atalho, contagem, tipo do nó. Também entra na busca. */
  readonly hint?: string;
  readonly group?: string;
  readonly onSelect?: (command: Command) => void;
}

export interface CommandPaletteProps {
  readonly open: boolean;
  readonly onClose?: () => void;
  readonly commands: readonly Command[];
  readonly placeholder?: string;
  readonly emptyMessage?: (query: string) => string;
}

/**
 * Paleta de comandos (Ctrl+K) — navegação, ações e, a partir da Fase 12, busca no acervo.
 *
 * A palete só monta quando abre. É de propósito: assim a busca digitada, o item selecionado e a
 * rolagem nascem zerados a cada abertura, sem nenhum efeito de reset. O original mantinha o
 * componente montado e limpava o estado num `useEffect` — três efeitos para simular o que a
 * desmontagem faz de graça.
 */
export function CommandPalette({ open, ...rest }: CommandPaletteProps) {
  if (!open) return null;
  return <PaletteDialog {...rest} />;
}

function PaletteDialog({
  onClose,
  commands,
  placeholder = "Buscar publicações, nós e ações…",
  emptyMessage = (query) => `Nenhum resultado para "${query}".`,
}: Omit<CommandPaletteProps, "open">) {
  injectCss("lbb-pal-css", CSS);

  const [query, setQuery] = useState("");
  const [rawSelected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = fold(query.trim());
    if (!q) return commands;
    return commands.filter((c) => fold(`${c.label} ${c.hint ?? ""} ${c.group ?? ""}`).includes(q));
  }, [commands, query]);

  // Clamp derivado em vez de efeito de reset — mesma razão do `Combobox`.
  const selected = Math.min(rawSelected, Math.max(filtered.length - 1, 0));

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>(`[data-idx="${selected}"]`);
    if (!list || !el) return;

    const top = el.offsetTop - list.offsetTop;
    const bottom = top + el.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top - 4;
    else if (bottom > list.scrollTop + list.clientHeight)
      list.scrollTop = bottom - list.clientHeight + 4;
  }, [selected]);

  const run = useCallback(
    (command: Command) => {
      onClose?.();
      command.onSelect?.(command);
    },
    [onClose],
  );

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setSelected(Math.min(selected + 1, filtered.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setSelected(Math.max(selected - 1, 0));
        break;
      case "Enter": {
        event.preventDefault();
        const command = filtered[selected];
        if (command) run(command);
        break;
      }
      case "Escape":
        event.preventDefault();
        onClose?.();
        break;
      default:
        break;
    }
  };

  // Agrupa preservando a ordem em que os grupos apareceram — a ordem dos comandos é uma decisão
  // de quem os declara, não algo a reordenar alfabeticamente aqui.
  const groups: [string, Command[]][] = [];
  const byGroup = new Map<string, Command[]>();
  for (const command of filtered) {
    const group = command.group ?? "Comandos";
    let list = byGroup.get(group);
    if (!list) {
      list = [];
      byGroup.set(group, list);
      groups.push([group, list]);
    }
    list.push(command);
  }

  let index = -1;

  return (
    <div className="lbb-pal-scrim" onMouseDown={onClose}>
      <div
        className="lbb-pal"
        role="dialog"
        aria-modal="true"
        aria-label="Paleta de comandos"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="lbb-pal-head">
          <Icon name="search" />
          <input
            ref={inputRef}
            className="lbb-pal-input"
            value={query}
            placeholder={placeholder}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(0);
            }}
            onKeyDown={handleKeyDown}
            role="combobox"
            aria-expanded
            aria-controls="lbb-pal-listbox"
            {...(filtered[selected] ? { "aria-activedescendant": `lbb-pal-opt-${selected}` } : {})}
          />
          <span className="lbb-kbd">Esc</span>
        </div>

        <div className="lbb-pal-list" ref={listRef} id="lbb-pal-listbox" role="listbox">
          {filtered.length === 0 && <div className="lbb-pal-empty">{emptyMessage(query)}</div>}
          {groups.map(([group, items]) => (
            <Fragment key={group}>
              <div className="lbb-pal-group">{group}</div>
              {items.map((command) => {
                index += 1;
                const i = index;
                return (
                  <button
                    key={command.id}
                    type="button"
                    className="lbb-pal-item"
                    data-idx={i}
                    id={`lbb-pal-opt-${i}`}
                    role="option"
                    aria-selected={i === selected}
                    data-sel={i === selected ? "true" : "false"}
                    onMouseEnter={() => setSelected(i)}
                    onClick={() => run(command)}
                  >
                    {command.icon && (
                      <span className="lbb-pal-item-icon">
                        <Icon name={command.icon} />
                      </span>
                    )}
                    <span className="lbb-pal-item-label">{command.label}</span>
                    {command.hint && <span className="lbb-pal-hint">{command.hint}</span>}
                  </button>
                );
              })}
            </Fragment>
          ))}
        </div>

        <div className="lbb-pal-foot">
          <span>↑↓ Navegar</span>
          <span>Enter Abrir</span>
          <span>Esc Fechar</span>
        </div>
      </div>
    </div>
  );
}
