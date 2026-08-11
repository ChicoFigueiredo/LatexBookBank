import { injectCss } from "@/design-system";

/**
 * As classes que as telas de acervo compartilham — Home, bibliotecas, livro, cadastro.
 *
 * Num arquivo só porque estavam nascendo dentro da Home: a segunda tela que usasse `.lbb-card`
 * dependeria de a Home ter sido montada antes para o CSS existir, e essa dependência invisível
 * quebra exatamente quando alguém entra direto pela URL da segunda tela.
 */
const CSS = `
.lbb-acervo{padding:var(--space-6) var(--space-7) var(--space-8);max-width:72rem}
.lbb-acervo-section{margin-top:var(--space-7)}
.lbb-acervo-eyebrow{font-family:var(--font-mono);font-size:var(--text-micro);font-weight:var(--weight-medium);letter-spacing:var(--tracking-wide);text-transform:uppercase;color:var(--text-muted);margin-bottom:var(--space-3)}
.lbb-acervo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(15rem,1fr));gap:var(--space-3)}
.lbb-card{display:flex;flex-direction:column;gap:4px;padding:var(--space-4);border:1px solid var(--border-default);border-radius:var(--radius-md);background:var(--surface);color:inherit;text-decoration:none;transition:border-color var(--motion-fast) var(--ease-standard),box-shadow var(--motion-fast) var(--ease-standard)}
.lbb-card:hover{border-color:var(--border-strong);box-shadow:var(--shadow-sm);text-decoration:none}
.lbb-card-title{display:flex;align-items:center;gap:6px;font-weight:var(--weight-medium);color:var(--text-strong)}
.lbb-card-meta{font-family:var(--font-mono);font-size:var(--text-meta);color:var(--text-muted)}
.lbb-banner-row{display:flex;align-items:center;gap:var(--space-4);padding:var(--space-4) var(--space-5);border:1px solid var(--accent-border);border-radius:var(--radius-md);background:var(--accent-surface)}
.lbb-banner-row[data-tone="warn"]{border-color:var(--warn-border);background:var(--warn-surface)}
.lbb-banner-body{flex:1;min-width:0}
.lbb-banner-title{font-weight:var(--weight-medium);color:var(--text-strong)}
.lbb-banner-sub{font-size:var(--text-body-sm);color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lbb-acervo-actions{display:flex;gap:var(--space-2);flex-wrap:wrap;margin-top:var(--space-4)}
.lbb-form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(14rem,1fr));gap:var(--space-4);margin-top:var(--space-4)}
.lbb-form-wide{grid-column:1/-1}
`;

export function useAcervoStyles(): void {
  injectCss("lbb-acervo-css", CSS);
}
