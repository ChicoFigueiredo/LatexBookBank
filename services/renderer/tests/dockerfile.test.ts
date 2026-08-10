import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * O `Dockerfile` não pode atrasar em relação aos workspaces.
 *
 * A imagem ficou **inbuildável da Fase 13 até a #148** sem ninguém perceber: o serviço de backup
 * nasceu (#132), o `Dockerfile` continuou copiando três `package.json`, e `bun install
 * --frozen-lockfile` recusa quando enxerga menos workspaces que o lockfile descreve. O contêiner
 * que já estava rodando continuou rodando, então o defeito só apareceria num deploy — que é o
 * pior momento possível para descobri-lo.
 *
 * Este teste roda em milissegundos e pega exatamente essa classe. Ele **não substitui** construir
 * a imagem: substitui esperar o deploy para descobrir que ela não constrói.
 *
 * Ver issue #151.
 */

const root = fileURLToPath(new URL("../../..", import.meta.url));

const dockerfile = readFileSync(join(root, "services/renderer/Dockerfile"), "utf8");

/** Os diretórios de workspace declarados no `package.json` da raiz, expandidos. */
function workspacePackages(): readonly string[] {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    workspaces?: string[];
  };

  const found: string[] = [];

  for (const pattern of manifest.workspaces ?? []) {
    // Os padrões do repositório são todos `dir/*`. Um glob de verdade seria mais código do que a
    // regra que ele serviria, e um padrão diferente faz este teste falhar em vez de mentir.
    expect(pattern.endsWith("/*")).toBe(true);

    const base = pattern.slice(0, -2);
    for (const entry of readdirSync(join(root, base))) {
      const dir = join(root, base, entry);
      if (!statSync(dir).isDirectory()) continue;

      try {
        statSync(join(dir, "package.json"));
      } catch {
        continue;
      }
      found.push(`${base}/${entry}`);
    }
  }

  return found;
}

describe("o Dockerfile do renderer conhece todos os workspaces", () => {
  it("copia o `package.json` de cada workspace, inclusive os que a imagem não usa", () => {
    // Inclusive os que não usa: `bun install --frozen-lockfile` compara o lockfile com os
    // workspaces que **enxerga**, não com os que precisa. Um faltando é "lockfile had changes".
    const missing = workspacePackages().filter(
      (workspace) => !dockerfile.includes(`COPY ${workspace}/package.json`),
    );

    expect(missing).toEqual([]);
  });

  it("o teste enxerga os workspaces de verdade — controle positivo", () => {
    // Sem isto, um erro na varredura daria uma lista vazia e o teste passaria sem verificar nada.
    const workspaces = workspacePackages();

    expect(workspaces).toContain("services/renderer");
    expect(workspaces).toContain("services/backup");
    expect(workspaces.length).toBeGreaterThanOrEqual(4);
  });

  it("o lockfile é copiado junto — sem ele o `--frozen-lockfile` não teria com o que comparar", () => {
    expect(dockerfile).toMatch(/COPY package\.json bun\.lock/);
  });
});
