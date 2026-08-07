import type { HTMLAttributes, ReactNode } from "react";

import { Icon, type IconName } from "../Icon";
import { injectCss } from "../shared/inject-css";

const CSS = `
.lbb-empty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:40px 24px;text-align:center;background:var(--surface);border:1px dashed var(--border-strong);border-radius:var(--radius-lg)}
.lbb-empty-icon{color:var(--text-muted);margin-bottom:2px}
.lbb-empty-eyebrow{font-family:var(--font-mono);font-size:var(--text-micro);font-weight:var(--weight-medium);letter-spacing:var(--tracking-wide);text-transform:uppercase;color:var(--text-muted)}
.lbb-empty-title{font-family:var(--font-display);font-size:var(--text-section);font-weight:var(--weight-bold);color:var(--text-strong);margin:0}
.lbb-empty-desc{margin:0;font-size:var(--text-body);color:var(--text-secondary);line-height:var(--leading-relaxed);max-width:440px}
`;

// `title` do HTML é `string`; aqui é `ReactNode`, então o nativo sai do tipo estendido.
export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  readonly icon?: IconName;
  readonly eyebrow?: ReactNode;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  /** A próxima ação. Um empty state sem saída é só uma tela vazia com texto. */
  readonly action?: ReactNode;
}

/**
 * Registra que não há nada **ainda** e aponta o próximo passo (spec §34).
 *
 * "Nenhuma questão" é constatação; "Nenhuma questão — crie a primeira ou importe uma biblioteca"
 * é interface.
 */
export function EmptyState({
  icon,
  eyebrow,
  title,
  description,
  action,
  ...rest
}: EmptyStateProps) {
  injectCss("lbb-empty-css", CSS);

  return (
    <div className="lbb-empty" {...rest}>
      {icon && (
        <span className="lbb-empty-icon">
          <Icon name={icon} size={22} />
        </span>
      )}
      {eyebrow && <span className="lbb-empty-eyebrow">{eyebrow}</span>}
      <h3 className="lbb-empty-title">{title}</h3>
      {description && <p className="lbb-empty-desc">{description}</p>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}
