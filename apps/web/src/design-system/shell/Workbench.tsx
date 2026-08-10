"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { BrandMark } from "../BrandMark";
import { Icon, type IconName } from "../Icon";
import { Breadcrumb, type BreadcrumbItem } from "../navigation/Breadcrumb";
import { Tooltip, TooltipProvider } from "../overlays/Tooltip";
import { injectCss } from "../shared/inject-css";
import { useStoredState } from "../shared/use-stored-state";
import { CommandPalette, type Command } from "./CommandPalette";
import { Divider } from "./Divider";

const CSS = `
.lbb-wb{display:flex;flex-direction:column;height:100vh;min-height:0;min-width:1100px;background:var(--bg);color:var(--text-primary);font-family:var(--font-ui);font-size:var(--text-body);line-height:var(--leading-normal)}
.lbb-wb-row{display:flex;flex:1;min-height:0}

.lbb-wb-rail{width:var(--rail-w);flex-shrink:0;background:var(--surface-sunken);border-right:1px solid var(--border-default);display:flex;flex-direction:column;min-height:0}
.lbb-wb-brand{display:flex;align-items:center;gap:10px;padding:14px 14px 12px}
.lbb-wb-brand-name{font-family:var(--font-display);font-weight:var(--weight-bold);font-size:var(--text-body);color:var(--text-strong);line-height:1.1}
.lbb-wb-brand-org{font-family:var(--font-mono);font-size:var(--text-micro);letter-spacing:var(--tracking-wide);text-transform:uppercase;color:var(--text-muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lbb-wb-rail-scroll{flex:1;overflow-y:auto;padding:0 8px 8px;display:flex;flex-direction:column;gap:1px;min-height:0}
.lbb-wb-eyebrow{font-family:var(--font-mono);font-size:var(--text-micro);font-weight:var(--weight-medium);letter-spacing:var(--tracking-wide);text-transform:uppercase;color:var(--text-muted);padding:12px 10px 4px}
.lbb-wb-item{position:relative;display:flex;align-items:center;gap:8px;width:100%;height:var(--control-h-md);padding:0 10px;border:none;border-radius:var(--radius-md);background:transparent;color:var(--text-secondary);font:inherit;font-size:var(--text-body);cursor:pointer;text-align:left;transition:background var(--motion-fast) var(--ease-standard),color var(--motion-fast) var(--ease-standard)}
.lbb-wb-item:hover{background:var(--hover-overlay);color:var(--text-primary)}
.lbb-wb-item:focus-visible{outline:2px solid var(--focus-ring);outline-offset:-2px}
.lbb-wb-item[data-active="true"]{background:var(--accent-surface);color:var(--accent-text);font-weight:var(--weight-medium)}
.lbb-wb-filete{position:absolute;left:0;top:7px;bottom:7px;width:2px;border-radius:1px;background:var(--accent)}
.lbb-wb-item-label{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lbb-wb-item-badge{font-family:var(--font-mono);font-size:var(--text-meta);color:var(--text-muted)}
.lbb-wb-item[data-active="true"] .lbb-wb-item-badge{color:var(--accent-text)}
.lbb-wb-rail-foot{border-top:1px solid var(--border-subtle);padding:8px}

.lbb-wb-sidebar{flex-shrink:0;background:var(--surface);border-right:1px solid var(--border-default);display:flex;flex-direction:column;min-height:0;min-width:0;overflow:hidden}
.lbb-wb-panel-head{display:flex;align-items:center;justify-content:space-between;gap:8px;height:44px;padding:0 8px 0 16px;border-bottom:1px solid var(--border-subtle);flex-shrink:0}
.lbb-wb-panel-title{font-family:var(--font-mono);font-size:var(--text-micro);font-weight:var(--weight-medium);letter-spacing:var(--tracking-wide);text-transform:uppercase;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lbb-wb-sidebar-body{flex:1;min-height:0;overflow-y:auto;padding:8px}

.lbb-wb-center{flex:1;min-width:420px;display:flex;flex-direction:column;min-height:0}
.lbb-wb-topbar{height:52px;flex-shrink:0;display:flex;align-items:center;gap:12px;padding:0 16px;background:var(--surface);border-bottom:1px solid var(--border-default);min-width:0}
.lbb-wb-topbar > *{flex-shrink:0}
.lbb-wb-topbar-crumbs{min-width:60px;flex-shrink:1;overflow:hidden}
.lbb-wb-spacer{flex:1}
.lbb-wb-search{display:flex;align-items:center;gap:8px;height:var(--control-h-md);width:250px;max-width:250px;min-width:96px;flex-shrink:1;padding:0 8px 0 10px;border:1px solid var(--border-default);border-radius:var(--radius-md);background:var(--surface-raised);color:var(--text-muted);font:inherit;font-size:var(--text-body-sm);cursor:pointer;transition:border-color var(--motion-fast) var(--ease-standard),color var(--motion-fast) var(--ease-standard)}
.lbb-wb-search:hover{border-color:var(--border-strong);color:var(--text-secondary)}
.lbb-wb-search-label{flex:1;min-width:0;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lbb-wb-iconbtn{display:flex;align-items:center;justify-content:center;width:var(--control-h-md);height:var(--control-h-md);flex-shrink:0;border:none;border-radius:var(--radius-md);background:transparent;color:var(--text-secondary);cursor:pointer;transition:background var(--motion-fast) var(--ease-standard)}
.lbb-wb-iconbtn:hover{background:var(--hover-overlay);color:var(--text-primary)}
.lbb-wb-iconbtn[data-active="true"]{background:var(--ai-surface);color:var(--ai-text)}
.lbb-wb-main{flex:1;min-height:0;display:flex;background:var(--bg)}
.lbb-wb-editor{flex:1;min-width:0;min-height:0;overflow:auto}
.lbb-wb-preview{flex-shrink:0;min-width:0;min-height:0;overflow:auto;background:var(--surface);border-left:1px solid var(--border-default)}

.lbb-wb-aside{width:var(--chat-w);flex-shrink:0;background:var(--surface);border-left:1px solid var(--border-default);display:flex;flex-direction:column;min-height:0}
.lbb-wb-aside-body{flex:1;min-height:0;overflow-y:auto}
.lbb-wb-fab{position:fixed;right:16px;bottom:calc(var(--footer-h) + 12px);z-index:var(--z-dropdown);display:flex;align-items:center;gap:8px;height:var(--control-h-lg);padding:0 14px;border:1px solid var(--ai-border);border-radius:var(--radius-pill);background:var(--surface-overlay);color:var(--ai-text);font:inherit;font-size:var(--text-body);font-weight:var(--weight-medium);cursor:pointer;box-shadow:var(--shadow-md);transition:box-shadow var(--motion-fast) var(--ease-standard),transform var(--motion-fast) var(--ease-standard)}
.lbb-wb-fab:hover{box-shadow:var(--shadow-lg);transform:translateY(-1px)}
.lbb-wb-fab-glyph{font-size:var(--text-section);line-height:1}
@media (prefers-reduced-motion: reduce){.lbb-wb-fab:hover{transform:none}}

.lbb-wb-foot{height:var(--footer-h);flex-shrink:0;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:0 12px;background:var(--surface-sunken);border-top:1px solid var(--border-default);font-family:var(--font-mono);font-size:var(--text-meta);color:var(--text-muted);white-space:nowrap;overflow:hidden}
.lbb-wb-foot > div{display:flex;align-items:center;gap:12px;min-width:0;overflow:hidden}
.lbb-kbd{font-family:var(--font-mono);font-size:var(--text-micro);border:1px solid var(--border-default);border-radius:var(--radius-sm);background:var(--surface);padding:1px 5px;color:var(--text-muted);white-space:nowrap}
`;

export interface WorkbenchModule {
  readonly id: string;
  readonly label: string;
  readonly icon?: IconName;
  readonly badge?: ReactNode;
  readonly group?: string;
}

export interface WorkbenchProps {
  /** Rail: Biblioteca · Publicações · Avaliações · Importação · Diagnóstico (D14). */
  readonly modules: readonly WorkbenchModule[];
  readonly activeModule?: string;
  readonly onModuleSelect?: (id: string) => void;

  readonly productName?: string;
  readonly productArea?: string;

  readonly breadcrumb?: readonly BreadcrumbItem[];
  readonly actions?: ReactNode;
  readonly searchLabel?: string;
  readonly commands?: readonly Command[];

  /** Sidebar contextual — reservada para a árvore do documento (D14). */
  readonly sidebar?: ReactNode;
  readonly sidebarTitle?: string;

  /** Zona central. Com `preview`, `editor` e `preview` dividem o main por uma divisória. */
  readonly editor?: ReactNode;
  readonly preview?: ReactNode;
  readonly children?: ReactNode;

  /** Painel agêntico. Fechado por padrão — a spec §14.6 pede FAB `✦` quando fechado. */
  readonly aside?: ReactNode;
  readonly asideTitle?: string;
  readonly defaultAsideOpen?: boolean;

  readonly statusLeft?: ReactNode;
  readonly statusRight?: ReactNode;

  /** Prefixo das chaves de `localStorage`. */
  readonly storageKey?: string;
}

const DEFAULT_SIDEBAR_W = 280;
const DEFAULT_ASIDE_W = 380;
const DEFAULT_PREVIEW_W = 460;

/**
 * O workbench de seis zonas da D14: rail de módulos · sidebar com a árvore · main dividido em
 * editor | preview · aside do agente · topbar de contexto · statusbar mono.
 *
 * **O aside nasce fechado.** Não é preferência estética: a spec §14.6 exige o painel do agente
 * fechado por padrão, e a aritmética confirma que está certo — a 1366 px, com rail (216),
 * sidebar (280) e aside (380) abertos, sobrariam 490 px para editor e preview juntos. O gesto de
 * abrir o agente é do usuário, e é ele quem decide de qual painel tirar o espaço.
 *
 * Nenhuma zona conhece o domínio: tudo entra por prop. O shell não sabe o que é uma questão.
 */
export function Workbench({
  modules,
  activeModule,
  onModuleSelect,
  productName = "LatexBookBank",
  productArea = "Banco de questões",
  breadcrumb = [],
  actions,
  searchLabel = "Buscar…",
  commands = [],
  sidebar,
  sidebarTitle = "Árvore",
  editor,
  preview,
  children,
  aside,
  asideTitle = "Agente",
  defaultAsideOpen = false,
  statusLeft,
  statusRight,
  storageKey = "lbb:workbench",
}: WorkbenchProps) {
  injectCss("lbb-wb-css", CSS);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [asideOpen, setAsideOpen] = useStoredState(`${storageKey}:aside-open`, defaultAsideOpen);
  const [sidebarW, setSidebarW] = useStoredState(`${storageKey}:sidebar-w`, DEFAULT_SIDEBAR_W);
  const [asideW, setAsideW] = useStoredState(`${storageKey}:aside-w`, DEFAULT_ASIDE_W);
  const [previewW, setPreviewW] = useStoredState(`${storageKey}:preview-w`, DEFAULT_PREVIEW_W);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /**
   * `Ctrl+Shift+A` alterna o aside (spec §14.6).
   *
   * Efeito separado do `Ctrl+K` porque este precisa do valor atual: `useStoredState` não aceita
   * função de atualização — o estado mora fora do React, e um updater teria que ler o
   * `localStorage` de novo para saber o que inverter.
   *
   * `event.code` e não `event.key`: com Shift pressionado o `key` vem maiúsculo, e em teclado
   * ABNT2 a combinação já rende outra coisa. O `code` é a tecla física, que é o que o atalho
   * significa.
   */
  useEffect(() => {
    if (!aside) return;

    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.code === "KeyA") {
        event.preventDefault();
        setAsideOpen(!asideOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aside, asideOpen, setAsideOpen]);

  // Agrupa preservando a ordem declarada — o rail reflete a ordem de trabalho, não o alfabeto.
  const groups = useMemo(() => {
    const out: [string, WorkbenchModule[]][] = [];
    const byGroup = new Map<string, WorkbenchModule[]>();
    for (const entry of modules) {
      const group = entry.group ?? "";
      let list = byGroup.get(group);
      if (!list) {
        list = [];
        byGroup.set(group, list);
        out.push([group, list]);
      }
      list.push(entry);
    }
    return out;
  }, [modules]);

  const mainContent = children ?? editor;

  return (
    // O provider mora aqui para que qualquer `Tooltip` dentro do workbench funcione sem
    // cerimônia — e para que todos compartilhem o mesmo "skip delay".
    <TooltipProvider>
      <div className="lbb-wb">
        <div className="lbb-wb-row">
          <nav className="lbb-wb-rail" aria-label="Módulos">
            <div className="lbb-wb-brand">
              <BrandMark size={26} />
              <div style={{ minWidth: 0 }}>
                <div className="lbb-wb-brand-name">{productName}</div>
                <div className="lbb-wb-brand-org">{productArea}</div>
              </div>
            </div>

            <div className="lbb-wb-rail-scroll">
              {groups.map(([group, items]) => (
                <Fragment key={group || "_topo"}>
                  {group && <div className="lbb-wb-eyebrow">{group}</div>}
                  {items.map((entry) => {
                    const active = entry.id === activeModule;
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        className="lbb-wb-item"
                        data-active={active ? "true" : "false"}
                        {...(active ? { "aria-current": "page" as const } : {})}
                        onClick={() => onModuleSelect?.(entry.id)}
                      >
                        {active && <span className="lbb-wb-filete" aria-hidden="true" />}
                        {entry.icon && <Icon name={entry.icon} />}
                        <span className="lbb-wb-item-label">{entry.label}</span>
                        {entry.badge != null && (
                          <span className="lbb-wb-item-badge">{entry.badge}</span>
                        )}
                      </button>
                    );
                  })}
                </Fragment>
              ))}
            </div>

            <div className="lbb-wb-rail-foot">
              <button type="button" className="lbb-wb-item" onClick={() => setPaletteOpen(true)}>
                <Icon name="search" />
                <span className="lbb-wb-item-label">Buscar</span>
                <span className="lbb-kbd">Ctrl K</span>
              </button>
            </div>
          </nav>

          {sidebar && (
            <>
              <nav className="lbb-wb-sidebar" style={{ width: sidebarW }} aria-label={sidebarTitle}>
                <div className="lbb-wb-panel-head">
                  <span className="lbb-wb-panel-title">{sidebarTitle}</span>
                </div>
                <div className="lbb-wb-sidebar-body">{sidebar}</div>
              </nav>
              <Divider
                value={sidebarW}
                min={216}
                max={440}
                defaultValue={DEFAULT_SIDEBAR_W}
                onChange={setSidebarW}
                label="Redimensionar a árvore"
              />
            </>
          )}

          <div className="lbb-wb-center">
            <header className="lbb-wb-topbar">
              <div className="lbb-wb-topbar-crumbs">
                {breadcrumb.length > 0 && <Breadcrumb items={breadcrumb} />}
              </div>
              <div className="lbb-wb-spacer" />

              <button
                type="button"
                className="lbb-wb-search"
                onClick={() => setPaletteOpen(true)}
                aria-label="Abrir paleta de comandos (Ctrl+K)"
              >
                <Icon name="search" />
                <span className="lbb-wb-search-label">{searchLabel}</span>
                <span className="lbb-kbd">Ctrl K</span>
              </button>

              {actions}

              {aside && (
                // O ícone `✦` sozinho não diz o que faz. O rótulo acessível resolve para o
                // leitor de tela; o tooltip resolve para quem enxerga e não reconhece o glifo.
                <Tooltip label={`${asideOpen ? "Fechar" : "Abrir"} ${asideTitle} · Ctrl+Shift+A`}>
                  <button
                    type="button"
                    className="lbb-wb-iconbtn"
                    data-active={asideOpen ? "true" : "false"}
                    // O nome de um botão de alternância não muda com o estado — quem carrega o
                    // estado é `aria-pressed`. Trocar o rótulo faria o leitor de tela anunciar
                    // "Fechar Agente, pressionado", que é a mesma informação duas vezes e em
                    // sentidos opostos. Também é o que colidia com o nome do FAB.
                    aria-label={`Painel ${asideTitle}`}
                    aria-pressed={asideOpen}
                    onClick={() => setAsideOpen(!asideOpen)}
                  >
                    <Icon name="sparkles" />
                  </button>
                </Tooltip>
              )}
            </header>

            <main className="lbb-wb-main">
              <div className="lbb-wb-editor">{mainContent}</div>
              {preview && (
                <>
                  <Divider
                    value={previewW}
                    min={320}
                    max={900}
                    defaultValue={DEFAULT_PREVIEW_W}
                    onChange={setPreviewW}
                    invert
                    label="Redimensionar o preview"
                  />
                  <div className="lbb-wb-preview" style={{ width: previewW }}>
                    {preview}
                  </div>
                </>
              )}
            </main>
          </div>

          {aside && !asideOpen && (
            <button
              type="button"
              className="lbb-wb-fab"
              onClick={() => setAsideOpen(true)}
              aria-label={`Abrir ${asideTitle}`}
            >
              {/* O glifo é o da spec §14.6 — não um ícone qualquer de chat. */}
              <span className="lbb-wb-fab-glyph" aria-hidden="true">
                ✦
              </span>
              <span>{asideTitle}</span>
            </button>
          )}

          {aside && asideOpen && (
            <>
              <Divider
                value={asideW}
                min={300}
                max={560}
                defaultValue={DEFAULT_ASIDE_W}
                onChange={setAsideW}
                invert
                label={`Redimensionar ${asideTitle}`}
              />
              <aside className="lbb-wb-aside" style={{ width: asideW }} aria-label={asideTitle}>
                <div className="lbb-wb-panel-head">
                  <span className="lbb-wb-panel-title">{asideTitle}</span>
                  <button
                    type="button"
                    className="lbb-wb-iconbtn"
                    aria-label={`Fechar ${asideTitle}`}
                    onClick={() => setAsideOpen(false)}
                  >
                    <Icon name="x" />
                  </button>
                </div>
                <div className="lbb-wb-aside-body">{aside}</div>
              </aside>
            </>
          )}
        </div>

        <footer className="lbb-wb-foot" aria-label="Barra de status">
          <div>{statusLeft}</div>
          <div>{statusRight}</div>
        </footer>

        <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          commands={commands}
        />
      </div>
    </TooltipProvider>
  );
}
