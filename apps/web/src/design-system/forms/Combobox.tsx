"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, FocusEvent as ReactFocusEvent } from "react";

import { Icon } from "../Icon";
import { injectCss } from "../shared/inject-css";
import type { ControlSize } from "./Button";

const CSS = `
.lbb-combo{position:relative;display:block;width:100%}
.lbb-combo-wrap{position:relative}
.lbb-combo-input{display:block;width:100%;border:1px solid var(--border-default);border-radius:var(--radius-md);background:var(--surface);color:var(--text-primary);font-family:var(--font-ui);transition:border-color var(--motion-fast) var(--ease-standard)}
.lbb-combo-input[data-size="sm"]{height:var(--control-h-sm);padding:0 26px 0 8px;font-size:var(--text-body-sm)}
.lbb-combo-input[data-size="md"]{height:var(--control-h-md);padding:0 30px 0 10px;font-size:var(--text-body)}
.lbb-combo-input[data-size="lg"]{height:var(--control-h-lg);padding:0 32px 0 12px;font-size:var(--text-body)}
.lbb-combo-input::placeholder{color:var(--text-muted)}
.lbb-combo-input:hover:not(:disabled){border-color:var(--border-strong)}
.lbb-combo-input:focus-visible{outline:2px solid var(--focus-ring);outline-offset:1px;border-color:var(--accent)}
.lbb-combo-input[aria-invalid="true"]{border-color:var(--danger)}
.lbb-combo-input:disabled{opacity:var(--disabled-opacity);cursor:not-allowed;background:var(--surface-sunken)}
.lbb-combo-chev{position:absolute;right:8px;top:50%;transform:translateY(-50%);pointer-events:none;color:var(--text-muted);display:flex}
.lbb-combo-pop{position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:var(--z-dropdown);background:var(--surface-overlay);border:1px solid var(--border-default);border-radius:var(--radius-md);box-shadow:var(--shadow-md);max-height:240px;overflow-y:auto;padding:4px}
.lbb-combo-opt{display:flex;align-items:center;gap:8px;width:100%;padding:0 8px;height:30px;border:none;border-radius:var(--radius-sm);background:transparent;color:var(--text-primary);font:inherit;font-size:var(--text-body);cursor:pointer;text-align:left}
.lbb-combo-opt[data-active="true"]{background:var(--accent-surface);color:var(--accent-text)}
.lbb-combo-opt-label{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lbb-combo-opt-hint{font-family:var(--font-mono);font-size:var(--text-meta);color:var(--text-muted)}
.lbb-combo-empty{padding:16px 10px;text-align:center;font-size:var(--text-body-sm);color:var(--text-secondary)}
`;

/**
 * Compara ignorando caixa **e acento**.
 *
 * Não é refinamento: o acervo é em português e cheio de "Matemática", "Função", "Álgebra". Uma
 * busca que exige o acento certo devolve zero resultado justamente nos termos mais usados, e o
 * usuário conclui que a tag não existe — e cria uma duplicada.
 */
const fold = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export interface ComboboxOption {
  readonly value: string;
  readonly label: string;
  /** Texto auxiliar em mono — contagem, código, `legacyId`. Também entra na busca. */
  readonly hint?: string;
}

export interface ComboboxProps {
  readonly options: readonly ComboboxOption[];
  readonly value?: string | undefined;
  readonly onChange?: (value: string, option: ComboboxOption) => void;
  readonly placeholder?: string;
  readonly emptyMessage?: string;
  readonly size?: ControlSize;
  readonly disabled?: boolean;
  readonly invalid?: boolean;
  readonly id?: string;
  readonly "aria-label"?: string;
  readonly "aria-describedby"?: string;
}

/**
 * Autocomplete acessível: `combobox` + `listbox`, navegação por ↑↓, Enter aplica, Esc cancela.
 *
 * Existe onde `Select` não serve — tags, bancas, instituições: listas que crescem com o acervo e
 * chegam a centenas de itens depois da importação do legado (Fase 11).
 *
 * A opção ativa é anunciada por `aria-activedescendant`, e não movendo o foco: o foco permanece
 * no input, que é o que permite continuar digitando enquanto se navega pela lista.
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Buscar e selecionar…",
  emptyMessage = "Nenhum resultado.",
  size = "md",
  disabled = false,
  invalid = false,
  id,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
}: ComboboxProps) {
  injectCss("lbb-combo-css", CSS);

  const [open, setOpen] = useState(false);
  /** `null` significa "não estou digitando" — o input mostra o rótulo do selecionado. */
  const [query, setQuery] = useState<string | null>(null);
  const [rawActive, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value) ?? null;

  const filtered = useMemo(() => {
    if (query == null || query === "") return options;
    const q = fold(query);
    return options.filter((o) => fold(`${o.label} ${o.hint ?? ""}`).includes(q));
  }, [options, query]);

  // Clamp derivado, não efeito: quando a busca encolhe a lista, o índice guardado pode ficar além
  // do fim. Corrigir isso num `useEffect` custaria um render extra e um frame apontando para uma
  // opção que não existe mais.
  const active = Math.min(rawActive, Math.max(filtered.length - 1, 0));

  // Mantém o item ativo visível. `scrollIntoView` levaria a página inteira junto quando o combobox
  // está perto da borda; aqui só o popover rola.
  useEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    if (!list || !el) return;

    const top = el.offsetTop;
    const bottom = top + el.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top - 4;
    else if (bottom > list.scrollTop + list.clientHeight)
      list.scrollTop = bottom - list.clientHeight + 4;
  }, [active]);

  const commit = useCallback(
    (option: ComboboxOption) => {
      onChange?.(option.value, option);
      setQuery(null);
      setActive(0);
      setOpen(false);
    },
    [onChange],
  );

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) {
          setOpen(true);
          setActive(0);
        } else {
          setActive(Math.min(active + 1, filtered.length - 1));
        }
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive(Math.max(active - 1, 0));
        break;
      case "Enter": {
        const option = filtered[active];
        if (open && option) {
          event.preventDefault();
          commit(option);
        }
        break;
      }
      case "Escape":
        if (open) {
          // `stopPropagation` para que Esc feche a lista sem também fechar o modal ou o painel do
          // agente que a contém — o gesto pertence ao componente mais interno.
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          setQuery(null);
          setActive(0);
        }
        break;
      case "Tab":
        setOpen(false);
        setQuery(null);
        setActive(0);
        break;
      default:
        break;
    }
  };

  const handleBlur = (event: ReactFocusEvent<HTMLDivElement>) => {
    if (rootRef.current?.contains(event.relatedTarget)) return;
    setOpen(false);
    setQuery(null);
    setActive(0);
  };

  const activeOption = filtered[active];

  return (
    <div className="lbb-combo" ref={rootRef} onBlur={handleBlur}>
      <div className="lbb-combo-wrap">
        <input
          id={id}
          className="lbb-combo-input"
          data-size={size}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          {...(open && activeOption ? { "aria-activedescendant": `${listId}-opt-${active}` } : {})}
          {...(ariaLabel ? { "aria-label": ariaLabel } : {})}
          {...(ariaDescribedBy ? { "aria-describedby": ariaDescribedBy } : {})}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          placeholder={placeholder}
          value={query ?? selected?.label ?? ""}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />
        <span className="lbb-combo-chev">
          <Icon name="chevrons-up-down" size={14} />
        </span>
      </div>

      {open && !disabled && (
        <div className="lbb-combo-pop" ref={listRef} role="listbox" id={listId}>
          {filtered.length === 0 && <div className="lbb-combo-empty">{emptyMessage}</div>}
          {filtered.map((option, index) => (
            <button
              key={option.value}
              type="button"
              className="lbb-combo-opt"
              data-idx={index}
              id={`${listId}-opt-${index}`}
              role="option"
              aria-selected={option.value === value}
              data-active={index === active ? "true" : "false"}
              onMouseEnter={() => setActive(index)}
              // Impede que o mousedown tire o foco do input antes do clique: sem isto, o `onBlur`
              // fecharia a lista e o clique cairia no vazio.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commit(option)}
            >
              <span className="lbb-combo-opt-label">{option.label}</span>
              {option.hint && <span className="lbb-combo-opt-hint">{option.hint}</span>}
              {option.value === value && <Icon name="check" size={13} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
