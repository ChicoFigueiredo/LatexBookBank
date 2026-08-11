import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * **Nenhuma abstração cerimonial além dos contratos** (§42 · D23 · issue #191).
 *
 * A D23 fixa quatro fronteiras de infraestrutura, e a Fase 15 acrescentou uma quinta pelo plano
 * (§8): reconhecer matemática num recorte não é "conversar com um modelo" — a entrada é uma imagem
 * e a saída traz confiança e alternativas.
 *
 * O item do checklist pedia auditoria, e a auditoria achou uma de verdade: `TransactionRunner`,
 * definido na Fase 0, **exportado e nunca implementado nem chamado**. As transações acontecem com
 * `prisma.$transaction` dentro dos adaptadores, que é onde elas pertencem — a transação é detalhe
 * do motor, e o caso de uso não a orquestra. O plano nunca a pediu; ela nasceu na execução.
 *
 * Este teste conta as fronteiras. Não impede acrescentar uma sexta — impede acrescentá-la **sem
 * decidir**, que é como a quinta quase passou despercebida e a sexta tinha passado.
 */

const root = fileURLToPath(new URL("..", import.meta.url));
const portsDir = path.join(root, "src/shared/ports");

/** Uma "fronteira" é uma interface com verbos — não um formato de entrada ou de saída. */
const FRONTEIRAS = [
  "StorageProvider",
  "RenderExecutor",
  "AiProvider",
  "MathRecognitionProvider",
  // A sexta, decidida no Beta Editorial e registrada em `docs/_atual/calibre-spike.md`. O que a
  // justifica não é "há mais de uma implementação" — há uma, a do Calibre. É a outra metade da
  // pergunta de controle: do outro lado dela há um banco de terceiro, num diretório do usuário,
  // com esquema que não controlamos. Sem a fronteira, `books_authors_link` apareceria no caso de
  // uso de importar livro, que é exatamente o que a §28 do prompt do time proíbe.
  "LibraryCatalogProvider",
] as const;

const arquivos = readdirSync(portsDir)
  .filter((file) => file.endsWith(".ts") && file !== "index.ts")
  .map((file) => path.join(portsDir, file));

const codigo = arquivos.map((file) => readFileSync(file, "utf8")).join("\n");

describe("as fronteiras de infraestrutura", () => {
  it("são exatamente as quatro da D23, a da Fase 15 e a do Beta Editorial", () => {
    for (const nome of FRONTEIRAS) {
      expect(codigo, `${nome} sumiu`).toContain(`export interface ${nome} {`);
    }
  });

  it("**toda** interface de porta ou é fronteira ou é forma de dado", () => {
    // Forma de dado — `PutAssetInput`, `AgentResult` — não é abstração: é o contrato do que
    // atravessa. O que a regra proíbe é a interface com verbo que ninguém implementa.
    const declaradas = [...codigo.matchAll(/export interface (\w+) \{([^}]*)\}/gs)];

    const comVerbo = declaradas
      .filter(([, , corpo]) => /^\s*\w+[?]?\s*[(<]/m.test(corpo ?? ""))
      .map(([, nome]) => nome as string);

    expect(comVerbo.sort()).toEqual([...FRONTEIRAS].sort());
  });

  it("cada fronteira tem implementação — abstração sem implementação é cerimônia", () => {
    // Foi o que pegou o `TransactionRunner`: interface exportada, zero implementações, zero
    // chamadores. Cinco fases depois, ninguém lembrava por que ela existia.
    const fontes = varrer(path.join(root, "src"));

    for (const nome of FRONTEIRAS) {
      const implementa = fontes.filter((file) =>
        readFileSync(file, "utf8").includes(`implements ${nome}`),
      );

      expect(implementa.length, `${nome} sem implementação`).toBeGreaterThanOrEqual(1);
    }
  });
});

function varrer(dir: string): string[] {
  const encontrados: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    // `generated` é código do Prisma: varrê-lo custa segundos e não diz nada sobre o desenho.
    if (entry.isDirectory() && entry.name !== "generated") {
      encontrados.push(...varrer(path.join(dir, entry.name)));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      encontrados.push(path.join(dir, entry.name));
    }
  }

  return encontrados;
}
