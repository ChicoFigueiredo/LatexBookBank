import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Nenhum ciclo entre módulos, fora o que está nomeado aqui (ARQ-12 da revisão de 2026-09-23).
 *
 * Ciclo entre módulos impede extrair um deles sozinho — o scan para um worker, o preview para um
 * pacote — e é o sintoma de primitiva genérica presa a módulo de feature. A revisão achou quatro:
 * assets ↔ recognition (a segmentação dentro do visualizador de PDF), questions ↔ preview (o
 * `buildFastPreview` morto), latex ↔ latex-knowledge e workspaces ↔ publications. Os quatro
 * caíram; este teste impede o quinto.
 *
 * O grafo é o dos imports de `src/modules`, estáticos e dinâmicos, por alias ou por caminho
 * relativo — o mesmo que o bundler segue. Um teste, e não `import/no-cycle`: a regra do ESLint
 * olha arquivo a arquivo e não vê o ciclo entre módulos que passa por arquivos diferentes.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modulesDir = path.join(root, "src/modules");

/**
 * A exceção nomeada: o nó carrega a questão, um para um. A árvore lê o tipo e o estado da
 * questão para se desenhar, e duplica a questão junto com o nó; criar questão é pôr um nó na
 * árvore. Separar os dois exigiria decidir quem é dono do par — e é uma decisão de agregado, não
 * de primitiva fora do lugar.
 */
const NAMED_CYCLES: readonly (readonly string[])[] = [["document-tree", "questions"]];

const IMPORT = /(?:import|export)\s[^;]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return filesUnder(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

function targetModule(specifier: string, from: string): string | null {
  if (specifier.startsWith("@modules/")) return specifier.split("/")[1] ?? null;
  if (specifier.startsWith("@/modules/")) return specifier.split("/")[2] ?? null;
  if (!specifier.startsWith(".")) return null;

  const relativeToModules = path.relative(modulesDir, path.resolve(path.dirname(from), specifier));
  if (relativeToModules.startsWith("..")) return null;
  return relativeToModules.split(path.sep)[0] ?? null;
}

function moduleGraph(): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  for (const file of filesUnder(modulesDir)) {
    const owner = path.relative(modulesDir, file).split(path.sep)[0] as string;
    const edges = graph.get(owner) ?? new Set<string>();
    graph.set(owner, edges);
    for (const match of readFileSync(file, "utf8").matchAll(IMPORT)) {
      const target = targetModule(match[1] ?? match[2] ?? "", file);
      if (target !== null && target !== owner) edges.add(target);
    }
  }
  return graph;
}

/** Componentes fortemente conexos (Tarjan): cada um com mais de um módulo é um ciclo. */
function cycles(graph: Map<string, Set<string>>): string[][] {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const found: string[][] = [];
  let counter = 0;

  const visit = (node: string) => {
    index.set(node, counter);
    low.set(node, counter);
    counter += 1;
    stack.push(node);
    onStack.add(node);

    for (const next of graph.get(node) ?? []) {
      if (!index.has(next)) {
        visit(next);
        low.set(node, Math.min(low.get(node)!, low.get(next)!));
      } else if (onStack.has(next)) {
        low.set(node, Math.min(low.get(node)!, index.get(next)!));
      }
    }

    if (low.get(node) === index.get(node)) {
      const component: string[] = [];
      let member: string | undefined;
      do {
        member = stack.pop()!;
        onStack.delete(member);
        component.push(member);
      } while (member !== node);
      if (component.length > 1) found.push(component.sort());
    }
  };

  for (const node of [...graph.keys()].sort()) if (!index.has(node)) visit(node);
  return found.sort((a, b) => a.join().localeCompare(b.join()));
}

describe("módulos sem ciclo", () => {
  it("o grafo de módulos lê os imports de verdade", () => {
    // Se o grafo vier vazio, o teste abaixo passa sem testar nada.
    const graph = moduleGraph();
    expect(graph.get("scan")?.has("assets")).toBe(true);
    expect(graph.get("recognition")?.has("questions")).toBe(true);
  });

  it("o único ciclo entre módulos é o nomeado: o nó e a questão que ele carrega", () => {
    expect(cycles(moduleGraph())).toEqual(NAMED_CYCLES);
  });
});
