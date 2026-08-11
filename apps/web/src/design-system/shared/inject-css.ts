/**
 * Injeta um stylesheet uma única vez, no primeiro render do componente.
 *
 * É a estratégia do DS de origem, e a razão de ele não precisar de Tailwind, CSS-in-JS nem
 * build step: cada componente carrega o próprio CSS, escrito em `var(--token)`.
 *
 * A guarda de `document` é o que o torna seguro para SSR — no servidor a função é no-op, e o
 * estilo chega no cliente antes da hidratação porque o import acontece no módulo.
 */
const injected = new Set<string>();

export function injectCss(id: string, css: string): void {
  if (typeof document === "undefined") return;
  if (injected.has(id) || document.getElementById(id)) return;

  injected.add(id);
  const style = document.createElement("style");
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
}

/** Keyframes compartilhado por spinners (botão em loading, jobs, agente). */
injectCss("lbb-spin", "@keyframes lbb-spin{to{transform:rotate(360deg)}}");
