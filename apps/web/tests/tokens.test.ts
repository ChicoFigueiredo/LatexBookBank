import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const tokens = readFileSync(
  fileURLToPath(new URL("../src/design-system/tokens.css", import.meta.url)),
  "utf8",
);

/** Extrai os nomes de token declarados dentro de um seletor. */
const namesIn = (selector: string): Set<string> => {
  const block = tokens.split(selector)[1]?.split("}")[0] ?? "";
  return new Set([...block.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((m) => m[1] as string));
};

const light = namesIn(":root {");
const dark = namesIn('[data-theme="dark"] {');
const contrast = namesIn('[data-theme="high-contrast"] {');

/**
 * O valor de manter o **contrato** de tokens do DS é que `AdminShell`, `Tree` e `ToolCallCard`
 * seguem funcionando sem reescrita. Um token que exista só no tema claro não falha o build —
 * ele simplesmente não muda no dark, e ninguém percebe até alguém abrir o app à noite.
 */

describe("contrato de tokens", () => {
  it("preserva os nomes que os componentes do DS consomem", () => {
    for (const name of [
      "--bg",
      "--surface",
      "--surface-sunken",
      "--surface-raised",
      "--surface-overlay",
      "--border-subtle",
      "--border-default",
      "--text-primary",
      "--text-secondary",
      "--accent",
      "--accent-surface",
      "--on-accent",
      "--focus-ring",
      "--rail-w",
      "--sidebar-w",
      "--chat-w",
      "--footer-h",
    ]) {
      expect(light, `token ${name} ausente`).toContain(name);
    }
  });

  it("mantém o namespace `--ai` exclusivo do agente", () => {
    for (const name of ["--ai", "--ai-text", "--ai-surface", "--ai-border"]) {
      expect(light).toContain(name);
    }
  });

  it("remove `pedagogy.*`, que não existe neste domínio", () => {
    expect(tokens).not.toMatch(/--pedagogy-/);
  });
});

describe("os três temas cobrem o mesmo conjunto de cor", () => {
  // Layout, tipografia e espaçamento não mudam por tema; só cor e elevação.
  const colorTokens = [...light].filter(
    (name) =>
      !/^--(space|radius|control-h|text-(micro|meta|body|card|section|page|display|hero)|weight|leading|tracking|font|motion|ease|z-|rail-|sidebar-|chat-|footer-|disabled-opacity)/.test(
        name,
      ),
  );

  it("dark redefine toda cor do tema claro", () => {
    const faltando = colorTokens.filter((name) => !dark.has(name));
    expect(faltando, `sem override no dark: ${faltando.join(", ")}`).toEqual([]);
  });

  it("alto contraste redefine toda cor do tema claro", () => {
    const faltando = colorTokens.filter((name) => !contrast.has(name));
    expect(faltando, `sem override no alto contraste: ${faltando.join(", ")}`).toEqual([]);
  });
});

describe("densidade de IDE (spec §34)", () => {
  it("mantém controles 26/32/38 e corpo 13px", () => {
    expect(tokens).toMatch(/--control-h-sm:\s*26px/);
    expect(tokens).toMatch(/--control-h-md:\s*32px/);
    expect(tokens).toMatch(/--control-h-lg:\s*38px/);
    expect(tokens).toMatch(/--text-body:\s*13px/);
  });
});
