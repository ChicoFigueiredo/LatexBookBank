import { injectCss } from "@/design-system";

/**
 * As classes que as telas de acervo compartilham — Home, bibliotecas, livro, cadastro.
 *
 * Num arquivo só porque estavam nascendo dentro da Home: a segunda tela que usasse `.lbb-card`
 * dependeria de a Home ter sido montada antes para o CSS existir, e essa dependência invisível
 * quebra exatamente quando alguém entra direto pela URL da segunda tela.
 */
const CSS = `
.lbb-acervo{padding:var(--space-6) var(--space-8) var(--space-12);max-width:72rem}
.lbb-acervo-section{margin-top:var(--space-8)}
.lbb-acervo-eyebrow{font-family:var(--font-mono);font-size:var(--text-micro);font-weight:var(--weight-medium);letter-spacing:var(--tracking-wide);text-transform:uppercase;color:var(--text-muted);margin-bottom:var(--space-3)}
.lbb-acervo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(15rem,1fr));gap:var(--space-3)}
.lbb-card{display:flex;flex-direction:column;gap:4px;padding:var(--space-4);border:1px solid var(--border-default);border-radius:var(--radius-md);background:var(--surface);color:inherit;text-decoration:none;transition:border-color var(--motion-fast) var(--ease-standard),box-shadow var(--motion-fast) var(--ease-standard)}
.lbb-card:hover{border-color:var(--border-strong);box-shadow:var(--shadow-sm);text-decoration:none}
.lbb-card-slot{position:relative;display:flex}
.lbb-card-slot>.lbb-card{flex:1;min-width:0;padding-right:calc(var(--space-4) + var(--control-h-sm))}
.lbb-card-actions{position:absolute;top:calc(var(--space-4) - 4px);right:calc(var(--space-4) - 6px)}
.lbb-card-title{display:flex;align-items:center;gap:6px;font-weight:var(--weight-medium);color:var(--text-strong)}
.lbb-card-meta{font-family:var(--font-mono);font-size:var(--text-meta);color:var(--text-muted)}
.lbb-banner-row{display:flex;align-items:center;gap:var(--space-4);padding:var(--space-4) var(--space-5);border:1px solid var(--accent-border);border-radius:var(--radius-md);background:var(--accent-surface)}
.lbb-banner-row[data-tone="warn"]{border-color:var(--warn-border);background:var(--warn-surface)}
.lbb-banner-body{flex:1;min-width:0}
.lbb-banner-title{font-weight:var(--weight-medium);color:var(--text-strong)}
.lbb-banner-sub{font-size:var(--text-body-sm);color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lbb-acervo-actions{display:flex;gap:var(--space-2);flex-wrap:wrap;margin-top:var(--space-4)}
/* ── Home recorrente: cartão de retomada ── */
.lbb-greet{font-family:var(--font-mono);font-size:var(--text-micro);font-weight:var(--weight-medium);letter-spacing:var(--tracking-wide);text-transform:uppercase;color:var(--text-muted)}
.lbb-greet-title{margin:6px 0 0;font-family:var(--font-display);font-size:var(--text-display);font-weight:var(--weight-bold);color:var(--text-strong);letter-spacing:-.01em;line-height:var(--leading-tight)}
.lbb-continue{margin-top:var(--space-6);background:var(--surface);border:1px solid var(--border-default);border-radius:var(--radius-lg);box-shadow:var(--shadow-sm);overflow:hidden}
.lbb-continue-main{display:flex;gap:var(--space-5);padding:var(--space-5)}
/* A lombada: identifica o livro antes de qualquer texto ser lido. */
.lbb-cover{width:52px;height:72px;flex-shrink:0;display:flex;flex-direction:column;justify-content:space-between;padding:6px 5px;border:1px solid var(--border-default);border-radius:3px;background:var(--surface-paper);box-shadow:var(--shadow-sm)}
.lbb-cover-title{font-family:var(--font-serif);font-size:8px;line-height:1.15;color:#2c2a26;overflow:hidden;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical}
.lbb-cover-vol{font-family:var(--font-mono);font-size:14px;font-weight:var(--weight-bold);color:var(--accent-warm)}
.lbb-continue-body{flex:1;min-width:0}
.lbb-continue-when{display:flex;align-items:center;gap:8px;font-family:var(--font-mono);font-size:var(--text-meta);color:var(--text-muted)}
.lbb-dot{width:3px;height:3px;border-radius:50%;background:currentColor;opacity:.6}
.lbb-continue-title{margin:6px 0 2px;font-family:var(--font-display);font-size:var(--text-section);font-weight:var(--weight-bold);color:var(--text-strong);line-height:var(--leading-tight)}
.lbb-continue-path{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:var(--text-body-sm);color:var(--text-secondary)}
.lbb-continue-leaf{color:var(--text-primary);font-weight:var(--weight-medium)}
.lbb-continue-actions{display:flex;flex-wrap:wrap;gap:var(--space-2);margin-top:var(--space-4)}
.lbb-continue-foot{display:flex;align-items:center;gap:var(--space-4);flex-wrap:wrap;padding:9px var(--space-5);border-top:1px solid var(--border-subtle);background:var(--surface-raised);font-family:var(--font-mono);font-size:var(--text-meta);color:var(--text-secondary)}
.lbb-continue-foot [data-tone="warn"]{color:var(--warn-text)}
.lbb-continue-foot .lbb-kbd{margin-left:auto;color:var(--text-muted)}

/* ── Listas em linha: pendências, bibliotecas, livros ── */
.lbb-section-head{display:flex;align-items:baseline;gap:10px;margin-bottom:var(--space-3)}
.lbb-section-head h2{margin:0;font-family:var(--font-display);font-size:var(--text-section);font-weight:var(--weight-bold);color:var(--text-strong)}
.lbb-section-count{font-family:var(--font-mono);font-size:var(--text-meta);color:var(--text-muted)}
.lbb-section-spacer{flex:1}
.lbb-rowlist{background:var(--surface);border:1px solid var(--border-default);border-radius:var(--radius-md);overflow:hidden}
.lbb-row{display:flex;align-items:center;gap:12px;width:100%;padding:11px var(--space-4);border:0;border-bottom:1px solid var(--border-subtle);background:transparent;color:var(--text-primary);font:inherit;text-align:left;text-decoration:none;cursor:pointer}
.lbb-rowlist>.lbb-row:last-child{border-bottom:0}
.lbb-row:hover{background:var(--hover-overlay);text-decoration:none}
.lbb-row:focus-visible{outline:2px solid var(--focus-ring);outline-offset:-2px}
.lbb-row-tile{display:grid;place-items:center;width:26px;height:26px;flex-shrink:0;border-radius:var(--radius-sm)}
.lbb-row-count{font-family:var(--font-mono);font-size:15px;font-weight:var(--weight-bold);min-width:28px}
.lbb-row-body{flex:1;min-width:0}
.lbb-row-title{display:block;font-weight:var(--weight-medium);color:var(--text-strong);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lbb-row-meta{display:block;font-size:var(--text-body-sm);color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lbb-row-stats{font-family:var(--font-mono);font-size:var(--text-meta);color:var(--text-secondary)}
.lbb-row-when{font-size:var(--text-body-sm);color:var(--text-muted);white-space:nowrap}
.lbb-row-cta{display:flex;align-items:center;gap:4px;font-size:var(--text-body-sm);font-weight:var(--weight-medium);color:var(--accent-text);white-space:nowrap}
.lbb-pill{font-family:var(--font-mono);font-size:var(--text-meta);padding:1px 7px;border-radius:999px;border:1px solid;white-space:nowrap}
.lbb-pill[data-tone="ok"]{border-color:var(--ok-border);background:var(--ok-surface);color:var(--ok-text)}
.lbb-pill[data-tone="warn"]{border-color:var(--warn-border);background:var(--warn-surface);color:var(--warn-text)}
.lbb-pill[data-tone="neutral"]{border-color:var(--border-default);background:var(--surface-raised);color:var(--text-muted)}
/* O menu de ações só cabe se a linha reservar o lugar dele. */
.lbb-row-actions{flex-shrink:0;margin:-4px -6px -4px 0}

/* ── Estante: a tabela de livros de uma biblioteca ── */
.lbb-filterbar{display:flex;align-items:center;gap:var(--space-3);margin-top:var(--space-5)}
.lbb-search{display:flex;align-items:center;gap:7px;height:var(--control-h-md);width:18rem;max-width:100%;padding:0 10px;border:1px solid var(--border-default);border-radius:var(--radius-md);background:var(--surface)}
.lbb-search input{flex:1;min-width:0;border:0;background:transparent;color:var(--text-primary);font:inherit;font-size:var(--text-body-sm);outline:none}
.lbb-shelf{margin-top:var(--space-4);background:var(--surface);border:1px solid var(--border-default);border-radius:var(--radius-md);overflow:hidden}
/* Uma grade só, repetida no cabeçalho e na linha: é o que garante o alinhamento das colunas. */
.lbb-shelf-row{display:grid;grid-template-columns:40px minmax(0,1fr) 8.5rem 6rem 5rem 8.5rem 7rem 32px;gap:var(--space-3);align-items:center;padding:9px var(--space-4);border-bottom:1px solid var(--border-subtle)}
.lbb-shelf-head{padding:8px var(--space-4);border-bottom:1px solid var(--border-default);background:var(--surface-raised);font-family:var(--font-mono);font-size:var(--text-micro);letter-spacing:var(--tracking-wide);text-transform:uppercase;color:var(--text-muted)}
.lbb-shelf-body{display:contents}
a.lbb-shelf-row{color:inherit;text-decoration:none}
a.lbb-shelf-row:hover{background:var(--hover-overlay);text-decoration:none}
a.lbb-shelf-row:focus-visible{outline:2px solid var(--focus-ring);outline-offset:-2px}
.lbb-shelf>:last-child{border-bottom:0}
.lbb-shelf-mark{width:28px;height:38px;display:grid;place-items:center;border:1px solid var(--border-default);border-radius:2px;background:var(--surface-paper);font-family:var(--font-mono);font-size:9px;font-weight:var(--weight-bold);color:var(--accent-warm)}
.lbb-shelf-title{font-weight:var(--weight-medium);color:var(--text-strong);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lbb-shelf-sub{font-size:var(--text-body-sm);color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lbb-shelf-cell{font-size:var(--text-body-sm);color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lbb-shelf-num{font-family:var(--font-mono);font-size:var(--text-body-sm);text-align:right;color:var(--text-primary)}
.lbb-shelf-hint{display:flex;align-items:center;gap:7px;margin-top:var(--space-3);font-size:var(--text-body-sm);color:var(--text-muted)}
.lbb-pill-icon{display:inline-flex;align-items:center;gap:5px}
@media (max-width:1100px){
  /* Autor e edição são os primeiros a sair: a decisão se sustenta com título, questões e estado. */
  .lbb-shelf-row{grid-template-columns:40px minmax(0,1fr) 5rem 8.5rem 7rem 32px}
  .lbb-shelf-row>[data-col="autor"],.lbb-shelf-row>[data-col="edicao"]{display:none}
}

.lbb-pick{display:flex;align-items:flex-start;gap:10px;width:100%;padding:11px 12px;border:1px solid var(--border-default);border-radius:var(--radius-md);background:var(--surface);color:inherit;text-align:left;text-decoration:none;cursor:pointer;font:inherit;transition:border-color var(--motion-fast) var(--ease-standard),background var(--motion-fast) var(--ease-standard)}
.lbb-pick:hover{border-color:var(--border-strong);background:var(--surface-raised);text-decoration:none}
.lbb-pick:focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px}
.lbb-pick-icon{display:grid;place-items:center;width:26px;height:26px;flex-shrink:0;border-radius:var(--radius-sm);background:var(--accent-surface);color:var(--accent-text)}
.lbb-pick-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.lbb-pick-title{font-weight:var(--weight-medium);color:var(--text-strong)}
.lbb-pick-desc{font-size:var(--text-body-sm);color:var(--text-secondary);text-wrap:pretty}
.lbb-form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(14rem,1fr));gap:var(--space-4);margin-top:var(--space-4)}
.lbb-form-wide{grid-column:1/-1}

/* ── Livro · overview: a parada entre escolher o livro e editá-lo (protótipo, 492–599) ── */
.lbb-book-head{display:flex;gap:var(--space-5)}
/* A capa grande: a mesma lombada da Home, no tamanho de quem chegou para olhar o livro. */
.lbb-book-cover{width:96px;height:132px;flex-shrink:0;display:flex;flex-direction:column;justify-content:space-between;padding:10px 9px;border:1px solid var(--border-default);border-radius:3px;background:var(--surface-paper);box-shadow:var(--shadow-md)}
.lbb-book-cover-title{font-family:var(--font-serif);font-size:11px;line-height:1.2;color:#2c2a26;overflow:hidden;display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical}
.lbb-book-cover-mark{font-family:var(--font-mono);font-size:22px;font-weight:var(--weight-bold);color:var(--accent-warm);line-height:1}
.lbb-book-cover-author{font-family:var(--font-serif);font-size:8px;color:#6b665e;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lbb-book-title{margin:5px 0 2px;font-family:var(--font-display);font-size:var(--text-page-title);font-weight:var(--weight-bold);color:var(--text-strong);letter-spacing:-.01em;line-height:var(--leading-tight)}
.lbb-book-sub{font-size:var(--text-body-sm);color:var(--text-secondary);text-wrap:pretty}
/* Metadados numa grade, e não numa lista: chave e valor alinhados leem-se de relance. */
.lbb-book-meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(9rem,1fr));gap:var(--space-3) var(--space-5);margin-top:var(--space-4);padding:var(--space-3) 0;border-top:1px solid var(--border-subtle);border-bottom:1px solid var(--border-subtle)}
.lbb-book-meta dt{font-family:var(--font-mono);font-size:var(--text-micro);letter-spacing:var(--tracking-wide);text-transform:uppercase;color:var(--text-muted)}
.lbb-book-meta dd{margin:2px 0 0;font-size:var(--text-body-sm);color:var(--text-primary)}
/* "Precisa da sua atenção": faixa warn, uma linha por pendência, CTA no fim de cada uma. */
.lbb-attention{margin-top:var(--space-6);border:1px solid var(--warn-border);border-radius:var(--radius-md);background:var(--warn-surface);overflow:hidden}
.lbb-attention-head{display:flex;align-items:center;gap:var(--space-2);padding:9px var(--space-4);border-bottom:1px solid var(--warn-border);font-weight:var(--weight-medium);color:var(--warn-text)}
.lbb-attention-count{font-family:var(--font-mono);font-size:var(--text-meta);font-weight:var(--weight-regular);opacity:.85}
.lbb-attention-row{display:flex;align-items:center;gap:var(--space-3);box-sizing:border-box;width:100%;padding:10px var(--space-4);border:0;border-bottom:1px solid var(--warn-border);background:transparent;color:var(--text-primary);font:inherit;font-size:var(--text-body-sm);text-align:left;text-decoration:none}
.lbb-attention-row:last-child{border-bottom:0}
.lbb-attention-row:hover{background:var(--hover-overlay);text-decoration:none}
.lbb-attention-row:focus-visible{outline:2px solid var(--focus-ring);outline-offset:-2px}
.lbb-attention-label{flex:1;min-width:0}
.lbb-attention-where{font-family:var(--font-mono);font-size:var(--text-meta);color:var(--text-secondary)}
.lbb-attention-cta{font-weight:var(--weight-medium);color:var(--accent-text);white-space:nowrap}
/* Estrutura à esquerda, fonte editorial à direita — as duas metades da pergunta "está pronto?". */
.lbb-book-split{display:grid;grid-template-columns:minmax(0,1fr) 20rem;gap:var(--space-5);align-items:start;margin-top:var(--space-6)}
.lbb-chapters{border:1px solid var(--border-default);border-radius:var(--radius-md);background:var(--surface);overflow:hidden}
.lbb-chapter{display:flex;align-items:center;gap:var(--space-3);box-sizing:border-box;width:100%;padding:9px var(--space-4);border:0;border-bottom:1px solid var(--border-subtle);background:transparent;color:inherit;font:inherit;font-size:var(--text-body-sm);text-align:left;text-decoration:none}
.lbb-chapter:last-child{border-bottom:0}
.lbb-chapter:hover{background:var(--hover-overlay);text-decoration:none}
.lbb-chapter:focus-visible{outline:2px solid var(--focus-ring);outline-offset:-2px}
.lbb-chapter-n{width:1.6rem;flex-shrink:0;font-family:var(--font-mono);font-size:var(--text-meta);color:var(--text-muted)}
.lbb-chapter-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lbb-bar{width:7.5rem;height:5px;flex-shrink:0;border-radius:3px;background:var(--surface-sunken);overflow:hidden}
.lbb-bar>span{display:block;height:100%;background:var(--ok)}
.lbb-bar[data-tone="warn"]>span{background:var(--warn)}
.lbb-bar[data-tone="neutral"]>span{background:var(--border-strong)}
.lbb-chapter-count{width:4rem;flex-shrink:0;text-align:right;font-family:var(--font-mono);font-size:var(--text-meta);color:var(--text-secondary)}
.lbb-source{border:1px solid var(--border-default);border-radius:var(--radius-md);background:var(--surface);padding:var(--space-4)}
.lbb-source-file{display:flex;align-items:center;gap:9px;margin:10px 0 8px}
.lbb-source-name{font-weight:var(--weight-medium);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lbb-source-size{font-family:var(--font-mono);font-size:var(--text-meta);color:var(--text-secondary)}
.lbb-source-origin{padding-top:8px;border-top:1px solid var(--border-subtle);font-size:var(--text-body-sm);color:var(--text-secondary);text-wrap:pretty}
.lbb-source-progress{margin-top:var(--space-4);padding-top:var(--space-3);border-top:1px solid var(--border-subtle);display:flex;flex-direction:column;gap:7px}
.lbb-source-bar{display:flex;align-items:center;gap:var(--space-2)}
.lbb-source-bar>.lbb-bar{flex:1;width:auto}

/* Abaixo de 60rem a coluna da fonte não cabe ao lado; ela vai para baixo inteira, não espremida. */
@media (max-width:60rem){
  .lbb-book-split{grid-template-columns:minmax(0,1fr)}
}
`;

export function useAcervoStyles(): void {
  injectCss("lbb-acervo-css", CSS);
}
