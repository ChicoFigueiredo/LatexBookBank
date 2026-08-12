/**
 * O visual dos menus — o de contexto (botão direito) e o do botão de três pontos.
 *
 * Num arquivo só porque, para quem olha, são o **mesmo** menu: mesma altura de item, mesmo realce,
 * mesmo vermelho na ação destrutiva. Duplicar as regras deixaria os dois divergirem no primeiro
 * ajuste de token, e a diferença apareceria só na tela em que ninguém estava olhando.
 *
 * O `id` também é compartilhado: `injectCss` grava uma vez por `id`, então a tela que usa os dois
 * componentes não carrega o CSS duas vezes.
 */
export const MENU_CSS_ID = "lbb-ctx-css";

export const MENU_CSS = `
.lbb-ctx{z-index:var(--z-dropdown);min-width:200px;padding:4px;border:1px solid var(--border-default);border-radius:var(--radius-md);background:var(--surface-overlay);box-shadow:var(--shadow-md);font-family:var(--font-ui);font-size:var(--text-body)}
.lbb-ctx-item{display:flex;align-items:center;gap:8px;width:100%;height:30px;padding:0 8px;border:0;border-radius:var(--radius-sm);background:transparent;text-align:left;font:inherit;color:var(--text-primary);cursor:pointer;outline:none;user-select:none}
.lbb-ctx-item[data-highlighted],.lbb-ctx-item:hover:not([data-disabled]),.lbb-ctx-item:focus-visible{background:var(--accent-surface);color:var(--accent-text)}
.lbb-ctx-item[data-tone="danger"]{color:var(--danger-text)}
.lbb-ctx-item[data-tone="danger"][data-highlighted],.lbb-ctx-item[data-tone="danger"]:hover:not([data-disabled]),.lbb-ctx-item[data-tone="danger"]:focus-visible{background:var(--danger-surface);color:var(--danger-text)}
.lbb-ctx-item[data-disabled]{color:var(--text-disabled);cursor:not-allowed}
.lbb-ctx-item[data-disabled]:hover{background:transparent;color:var(--text-disabled)}
.lbb-ctx-label{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lbb-ctx-shortcut{font-family:var(--font-mono);font-size:var(--text-meta);color:var(--text-muted)}
.lbb-ctx-item[data-highlighted] .lbb-ctx-shortcut{color:inherit;opacity:.8}
.lbb-ctx-sep{height:1px;margin:4px 6px;background:var(--border-subtle)}
`;
