import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * **Todo `var(--token)` referencia um token que existe.**
 *
 * O guarda que faltava, e o defeito que o motivou é do tipo mais caro: silencioso. A regra
 *
 *   .lbb-acervo{padding:var(--space-6) var(--space-7) var(--space-8)}
 *
 * parecia certa e nunca funcionou — a escala é `05,1,2,3,4,5,6,8,10,12` e **não tem 7**. Uma
 * declaração com `var()` indefinido é inválida por inteiro, então o CSS descartava o `padding`
 * completo e *todas* as telas de acervo renderizaram coladas na borda por meses. Ninguém percebeu
 * porque o `PageHeader` trazia recuo próprio e disfarçava o buraco nas telas onde ele aparecia.
 *
 * A varredura achou outros quatro do mesmo tipo — `--text-title`, `--text-body-lg`,
 * `--surface-default` e `--font-serif` — espalhados por diagnóstico, render e acervo.
 *
 * Nem todo `--x` é token do sistema: `--lbb-math-src` e afins são propriedades locais, declaradas
 * inline no elemento que as consome. Elas entram na lista de exceções **nomeadas**, para que a
 * exceção seja uma decisão e não um furo no teste.
 */

const raiz = fileURLToPath(new URL("..", import.meta.url));

/** Propriedades customizadas locais: declaradas via `style` no próprio elemento, não em tokens. */
const LOCAIS = new Set(["--lbb-math-src", "--lbb-symbol-src"]);

/**
 * Comentário fora, antes de procurar.
 *
 * A documentação do design system fala sobre `var(--token)` em prosa, e sem esta limpeza o teste
 * acusaria a própria explicação de por que ele existe.
 */
const semComentarios = (codigo: string): string =>
  codigo.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

const definidos = new Set(
  [...readFileSync(path.join(raiz, "src/design-system/tokens.css"), "utf8").matchAll(/(--[a-z0-9-]+)\s*:/g)].map(
    (m) => m[1] as string,
  ),
);

function varrer(dir: string): string[] {
  const encontrados: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "generated" || entry.name === "node_modules") continue;

    const alvo = path.join(dir, entry.name);
    if (entry.isDirectory()) encontrados.push(...varrer(alvo));
    else if (/\.(tsx?|css)$/.test(entry.name)) encontrados.push(alvo);
  }

  return encontrados;
}

describe("os tokens de estilo", () => {
  it("existem todos — `var()` indefinido derruba a declaração inteira, em silêncio", () => {
    const orfaos = new Map<string, Set<string>>();

    for (const arquivo of [
      ...varrer(path.join(raiz, "app")),
      ...varrer(path.join(raiz, "src")),
    ]) {
      const codigo = semComentarios(readFileSync(arquivo, "utf8"));

      for (const [, token] of codigo.matchAll(/var\((--[a-z0-9-]+)/g)) {
        if (!token || definidos.has(token) || LOCAIS.has(token)) continue;

        const onde = orfaos.get(token) ?? new Set<string>();
        onde.add(path.relative(raiz, arquivo));
        orfaos.set(token, onde);
      }
    }

    const relato = [...orfaos]
      .map(([token, onde]) => `${token} — ${[...onde].join(", ")}`)
      .sort();

    expect(relato, relato.join("\n")).toEqual([]);
  });

  it("a escala de espaço não tem `--space-7`, e é isso que o teste acima protege", () => {
    // Ancora a causa do defeito: quem acrescentar `--space-7` aos tokens invalida o comentário
    // acima, e quem escrever `var(--space-7)` sem acrescentá-lo é pego pelo primeiro caso.
    expect(definidos.has("--space-6")).toBe(true);
    expect(definidos.has("--space-7")).toBe(false);
    expect(definidos.has("--space-8")).toBe(true);
  });
});
