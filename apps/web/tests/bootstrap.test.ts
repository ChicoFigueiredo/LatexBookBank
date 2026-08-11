import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

/**
 * Smoke test do bootstrap (issue #3): garante que a fiação do workspace está de pé antes de
 * qualquer código de domínio existir. Substituído por testes reais conforme as fases avançam.
 */
describe("bootstrap do workspace", () => {
  it("expõe os scripts que o CI executa", () => {
    const pkg = JSON.parse(read("../package.json")) as {
      scripts: Record<string, string>;
    };

    for (const script of ["dev", "build", "lint", "typecheck", "test"]) {
      expect(pkg.scripts[script], `script "${script}" ausente`).toBeDefined();
    }
  });

  it("serve o app na porta 28080, fora da faixa efêmera do kernel", () => {
    const pkg = JSON.parse(read("../package.json")) as {
      scripts: Record<string, string>;
    };

    // D19: bloco 28xxx, abaixo de 32768 para não colidir com portas efêmeras de saída.
    expect(pkg.scripts["dev"]).toContain("28080");
    expect(pkg.scripts["start"]).toContain("28080");
  });

  it("mantém o TypeScript em modo estrito", () => {
    const tsconfig = JSON.parse(read("../tsconfig.json")) as {
      compilerOptions: Record<string, unknown>;
    };

    expect(tsconfig.compilerOptions["strict"]).toBe(true);
    expect(tsconfig.compilerOptions["noUncheckedIndexedAccess"]).toBe(true);
  });
});
