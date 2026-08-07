import type { CSSProperties, ReactNode } from "react";

import { injectCss } from "../shared/inject-css";

const CSS = `
.lbb-ph{display:flex;flex-wrap:wrap;align-items:flex-start;gap:12px 16px;padding:20px 28px 16px}
.lbb-ph-body{display:flex;flex-direction:column;gap:2px;min-width:280px;flex:1}
.lbb-ph-eyebrow{font-family:var(--font-mono);font-size:var(--text-micro);font-weight:var(--weight-medium);letter-spacing:var(--tracking-wide);text-transform:uppercase;color:var(--text-secondary)}
.lbb-ph-titlerow{display:flex;align-items:center;gap:10px;min-width:0}
.lbb-ph-title{font-family:var(--font-display);font-size:var(--text-page-title);font-weight:var(--weight-bold);color:var(--text-strong);line-height:var(--leading-tight);letter-spacing:-0.01em;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lbb-ph-meta{font-size:var(--text-body);color:var(--text-secondary);margin-top:2px}
.lbb-ph-actions{display:flex;align-items:center;gap:8px;flex-shrink:0;padding-top:2px}
`;

export interface PageHeaderProps {
  /** Rótulo mono acima do título — tipo do nó, `legacyId`, código da publicação. */
  readonly eyebrow?: ReactNode;
  readonly title: ReactNode;
  /** Tipicamente um `ArtifactStatus`: o estado pertence ao lado do nome, não a um canto. */
  readonly status?: ReactNode;
  readonly meta?: ReactNode;
  readonly actions?: ReactNode;
  readonly style?: CSSProperties;
  readonly children?: ReactNode;
}

/**
 * Cabeçalho de página: eyebrow mono, título, estado ao lado do título, metadados e ações à direita.
 *
 * O `status` fica colado ao título de propósito — é onde o olho já está. Um patch do agente
 * aguardando aprovação (`agent_proposed`) precisa ser lido junto com o nome da questão, não
 * descoberto depois de rolar a página.
 */
export function PageHeader({
  eyebrow,
  title,
  status,
  meta,
  actions,
  style,
  children,
}: PageHeaderProps) {
  injectCss("lbb-ph-css", CSS);

  return (
    <header className="lbb-ph" style={style}>
      <div className="lbb-ph-body">
        {eyebrow && <span className="lbb-ph-eyebrow">{eyebrow}</span>}
        <div className="lbb-ph-titlerow">
          <h1 className="lbb-ph-title">{title}</h1>
          {status}
        </div>
        {meta && <div className="lbb-ph-meta">{meta}</div>}
        {children}
      </div>
      {actions && <div className="lbb-ph-actions">{actions}</div>}
    </header>
  );
}
