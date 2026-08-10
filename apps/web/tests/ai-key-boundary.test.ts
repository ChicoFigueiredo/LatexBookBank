import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * **A chave de IA existe só no servidor e nunca chega ao browser.**
 *
 * Não dá para verificar isso lendo um arquivo: um segredo vaza por _alcance_. Basta um Client
 * Component importar, três saltos abaixo, o módulo que lê `AI_API_KEY` — e o bundler leva a
 * variável junto, sem avisar. O que este teste faz é percorrer o grafo de imports a partir de
 * cada `"use client"` e afirmar que nenhum caminho chega lá.
 *
 * `import "server-only"` já derruba o build nesse caso. Este teste existe porque o erro do build
 * aparece a um `bun run build` de distância, sem dizer qual foi o caminho — e porque a regra vale
 * mesmo se alguém trocar o marcador por outra coisa.
 *
 * Ver spec §5.6 e §14 · issue #91.
 */

const root = fileURLToPath(new URL("..", import.meta.url));
const srcDir = path.join(root, "src");

const ALIASES: ReadonlyArray<readonly [string, string]> = [
  ["@modules/", path.join(srcDir, "modules/")],
  ["@shared/", path.join(srcDir, "shared/")],
  ["@infrastructure/", path.join(srcDir, "infrastructure/")],
  ["@design-system/", path.join(srcDir, "design-system/")],
  ["@/", `${srcDir}/`],
];

const EXTENSIONS = [".ts", ".tsx"];

async function sourceFiles(dir: string): Promise<string[]> {
  const found: string[] = [];

  const walk = async (current: string): Promise<void> => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules") await walk(full);
      } else if (EXTENSIONS.includes(path.extname(entry.name))) {
        found.push(full);
      }
    }
  };

  await walk(dir);
  return found;
}

const IMPORT =
  /(?:^|\n)\s*(?:import|export)[\s\S]{0,400}?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;

function importsOf(file: string): string[] {
  const code = readFileSync(file, "utf8");
  const specifiers: string[] = [];

  for (const match of code.matchAll(IMPORT)) {
    const specifier = match[1] ?? match[2];
    if (specifier !== undefined) specifiers.push(specifier);
  }
  return specifiers;
}

/** Resolve um especificador para um caminho de arquivo, ou `null` se for pacote externo. */
function resolve(specifier: string, from: string): string | null {
  let base: string | null = null;

  if (specifier.startsWith(".")) {
    base = path.resolve(path.dirname(from), specifier);
  } else {
    for (const [prefix, target] of ALIASES) {
      if (specifier.startsWith(prefix)) {
        base = path.join(target, specifier.slice(prefix.length));
        break;
      }
    }
  }
  if (base === null) return null;

  for (const candidate of [
    ...EXTENSIONS.map((ext) => base + ext),
    ...EXTENSIONS.map((ext) => path.join(base as string, `index${ext}`)),
    base,
  ]) {
    try {
      readFileSync(candidate, "utf8");
      return candidate;
    } catch {
      // próximo candidato
    }
  }
  return null;
}

/** Todo módulo alcançável a partir de `entry`, com o caminho que levou até cada um. */
function reachable(entry: string): Map<string, string[]> {
  const trail = new Map<string, string[]>([[entry, [entry]]]);
  const queue = [entry];

  while (queue.length > 0) {
    const current = queue.shift() as string;
    const pathToHere = trail.get(current) as string[];

    for (const specifier of importsOf(current)) {
      const resolved = resolve(specifier, current);
      if (resolved === null || trail.has(resolved)) continue;

      trail.set(resolved, [...pathToHere, resolved]);
      queue.push(resolved);
    }
  }
  return trail;
}

const relative = (file: string) => path.relative(root, file).replaceAll(path.sep, "/");

const PROVIDER = path.join(srcDir, "modules/agents/infrastructure/openai-compatible-provider.ts");
const ENV = path.join(srcDir, "shared/config/env.ts");

describe("a chave de IA não chega ao browser", () => {
  it("o provider se marca como `server-only`", () => {
    // Primeira linha, não uma qualquer: o marcador tem que executar antes de qualquer coisa.
    expect(readFileSync(PROVIDER, "utf8").split("\n")[0]).toBe('import "server-only";');
  });

  it("nenhum Client Component alcança o provider ou o ambiente", async () => {
    const clientFiles = (await sourceFiles(srcDir))
      .concat(await sourceFiles(path.join(root, "app")))
      .filter((file) => /^["']use client["']/.test(readFileSync(file, "utf8").trimStart()));

    // Se este número virar zero, o teste passa sem testar nada.
    expect(clientFiles.length).toBeGreaterThan(5);

    const leaks: string[] = [];
    for (const file of clientFiles) {
      const graph = reachable(file);
      for (const forbidden of [PROVIDER, ENV]) {
        const trail = graph.get(forbidden);
        if (trail) leaks.push(trail.map(relative).join("\n  → "));
      }
    }

    expect(leaks.join("\n\n")).toBe("");
  });

  it("`AI_API_KEY` é lida do ambiente num lugar só, e nunca com prefixo público", async () => {
    // `NEXT_PUBLIC_` é o que faz o bundler embutir o valor no JavaScript do browser — o único
    // jeito de o segredo vazar mesmo com todo o resto certo.
    const readers: string[] = [];
    const mentions: string[] = [];

    for (const file of [
      ...(await sourceFiles(srcDir)),
      ...(await sourceFiles(path.join(root, "app"))),
    ]) {
      const code = readFileSync(file, "utf8");
      expect(code).not.toMatch(/NEXT_PUBLIC_AI/);
      if (!code.includes("AI_API_KEY")) continue;

      mentions.push(relative(file));
      // Quem só **nomeia** a variável está dando instrução de configuração; quem toca
      // `process.env` está lendo o segredo. Só o segundo é fronteira.
      if (code.includes("process.env")) readers.push(relative(file));
    }

    expect(readers).toEqual(["src/shared/config/env.ts"]);
    expect([...mentions].sort()).toEqual([
      // Cita o nome na mensagem de credencial ausente — para o erro dizer o que fazer.
      "src/modules/agents/infrastructure/openai-compatible-provider.ts",
      "src/shared/config/env.ts",
    ]);
  });
});
