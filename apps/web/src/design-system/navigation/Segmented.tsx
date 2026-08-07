import { Icon, type IconName } from "../Icon";
import { injectCss } from "../shared/inject-css";

const CSS = `
.lbb-seg{display:inline-flex;border:1px solid var(--border-default);border-radius:var(--radius-md);background:var(--surface-raised);padding:2px;gap:2px}
.lbb-seg-item{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:26px;padding:0 10px;border:none;border-radius:var(--radius-sm);background:transparent;color:var(--text-secondary);font:inherit;font-size:var(--text-body-sm);font-weight:var(--weight-medium);cursor:pointer;transition:background var(--motion-fast) var(--ease-standard),color var(--motion-fast) var(--ease-standard)}
.lbb-seg-item:hover{color:var(--text-primary)}
.lbb-seg-item:focus-visible{outline:2px solid var(--focus-ring);outline-offset:1px}
.lbb-seg-item[aria-pressed="true"]{background:var(--surface);color:var(--accent-text);box-shadow:var(--shadow-sm)}
`;

export interface SegmentedOption {
  readonly id: string;
  readonly label: string;
  readonly icon?: IconName;
  /** Mostra o rótulo ao lado do ícone. Sem isto, ícone sozinho e o rótulo vira `aria-label`. */
  readonly showLabel?: boolean;
}

export interface SegmentedProps {
  readonly options: readonly SegmentedOption[];
  readonly value: string;
  readonly onChange?: (id: string) => void;
  readonly "aria-label"?: string;
}

/**
 * Alternância exclusiva e curta: tema claro/escuro, editor|preview|dividido, densidade da árvore.
 *
 * Não é `Tabs`: abas trocam o **conteúdo** de um painel, o segmented troca o **modo de ver** o
 * mesmo conteúdo. Confundir os dois é o que produz aquela barra de abas que muda a página inteira.
 */
export function Segmented({ options, value, onChange, "aria-label": ariaLabel }: SegmentedProps) {
  injectCss("lbb-seg-css", CSS);

  return (
    <div className="lbb-seg" role="group" {...(ariaLabel ? { "aria-label": ariaLabel } : {})}>
      {options.map((option) => {
        const iconOnly = option.icon != null && !option.showLabel;
        return (
          <button
            key={option.id}
            type="button"
            className="lbb-seg-item"
            aria-pressed={option.id === value}
            // Ícone sozinho não fala: o rótulo migra para o `aria-label` em vez de sumir.
            {...(iconOnly ? { "aria-label": option.label } : {})}
            title={option.label}
            onClick={() => onChange?.(option.id)}
          >
            {option.icon && <Icon name={option.icon} size={14} />}
            {!iconOnly && option.label}
          </button>
        );
      })}
    </div>
  );
}
