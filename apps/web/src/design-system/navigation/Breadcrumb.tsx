import { Fragment } from "react";
import type { ReactNode } from "react";

import { Icon } from "../Icon";
import { injectCss } from "../shared/inject-css";

const CSS = `
.lbb-crumbs{display:flex;align-items:center;gap:6px;min-width:0;font-size:var(--text-body)}
.lbb-crumb{color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-decoration:none;background:none;border:0;padding:0;font:inherit;cursor:default}
a.lbb-crumb,button.lbb-crumb{cursor:pointer}
a.lbb-crumb:hover,button.lbb-crumb:hover{color:var(--accent-text);text-decoration:underline;text-underline-offset:2px}
.lbb-crumb:focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px;border-radius:var(--radius-sm)}
.lbb-crumb[aria-current="page"]{color:var(--text-strong);font-weight:var(--weight-medium)}
.lbb-crumb-sep{color:var(--text-muted);display:flex;flex-shrink:0}
`;

export interface BreadcrumbItem {
  readonly label: ReactNode;
  readonly href?: string;
  readonly onClick?: () => void;
}

export interface BreadcrumbProps {
  readonly items: readonly BreadcrumbItem[];
  readonly "aria-label"?: string;
}

/**
 * Trilha do nó atual dentro da publicação — Biblioteca › Publicação › Capítulo › Seção › Questão.
 *
 * Na topbar (D14) é o que responde "onde eu estou" numa árvore de profundidade arbitrária, onde a
 * sidebar sozinha só mostra o ramo aberto.
 *
 * Um item sem destino é `<span>`, não `<a>` desativado: link que não navega é ruído no leitor de
 * tela e alvo de clique frustrado no mouse. Com `onClick` e sem `href`, vira `<button>` — a
 * navegação da árvore é estado do cliente, não URL.
 */
export function Breadcrumb({ items, "aria-label": ariaLabel = "Localização" }: BreadcrumbProps) {
  injectCss("lbb-crumbs-css", CSS);

  return (
    <nav className="lbb-crumbs" aria-label={ariaLabel}>
      {items.map((item, index) => {
        const last = index === items.length - 1;
        const current = last ? { "aria-current": "page" as const } : {};

        return (
          <Fragment key={index}>
            {index > 0 && (
              <span className="lbb-crumb-sep" aria-hidden="true">
                <Icon name="chevron-right" size={12} />
              </span>
            )}
            {item.href && !last ? (
              <a
                className="lbb-crumb"
                href={item.href}
                {...(item.onClick ? { onClick: item.onClick } : {})}
              >
                {item.label}
              </a>
            ) : item.onClick && !last ? (
              <button type="button" className="lbb-crumb" onClick={item.onClick}>
                {item.label}
              </button>
            ) : (
              <span className="lbb-crumb" {...current}>
                {item.label}
              </span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
