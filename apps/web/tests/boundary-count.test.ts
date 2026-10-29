import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
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
const BOUNDARIES = [
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

const portFiles = readdirSync(portsDir)
  .filter((file) => file.endsWith(".ts") && file !== "index.ts")
  .map((file) => path.join(portsDir, file));

const portsCode = portFiles.map((file) => readFileSync(file, "utf8")).join("\n");

describe("as fronteiras de infraestrutura", () => {
  it("são exatamente as quatro da D23, a da Fase 15 e a do Beta Editorial", () => {
    for (const name of BOUNDARIES) {
      expect(portsCode, `${name} sumiu`).toContain(`export interface ${name} {`);
    }
  });

  it("**toda** interface de porta ou é fronteira ou é forma de dado", () => {
    // Forma de dado — `PutAssetInput`, `AgentResult` — não é abstração: é o contrato do que
    // atravessa. O que a regra proíbe é a interface com verbo que ninguém implementa.
    expect(interfacesWithVerbs(portsCode).sort()).toEqual([...BOUNDARIES].sort());
  });

  it("cada fronteira tem implementação — abstração sem implementação é cerimônia", () => {
    // Foi o que pegou o `TransactionRunner`: interface exportada, zero implementações, zero
    // chamadores. Cinco fases depois, ninguém lembrava por que ela existia.
    const sources = walk(path.join(root, "src"));

    for (const name of BOUNDARIES) {
      const implementations = sources.filter((file) =>
        readFileSync(file, "utf8").includes(`implements ${name}`),
      );

      expect(implementations.length, `${name} sem implementação`).toBeGreaterThanOrEqual(1);
    }
  });
});

/**
 * O guard de cima só vale o que vale o detector. A primeira versão era uma regex que exigia `{`
 * logo depois do nome e parava no primeiro `}`: interface genérica, com `extends`, com objeto
 * aninhado antes do verbo, com verbo escrito como propriedade e type alias passavam todas
 * (TST-12 da revisão de 2026-09-23). Cada forma aqui é uma porta que ele tem de ver.
 */
describe("o detector de interface com verbo", () => {
  const cases: ReadonlyArray<readonly [string, string, string]> = [
    [
      "genérica",
      "TransactionRunner",
      "export interface TransactionRunner<T> {\n  run(work: () => Promise<T>): Promise<T>;\n}",
    ],
    [
      "com extends",
      "Cache",
      "interface Base { size: number }\nexport interface Cache extends Base {\n  get(key: string): string;\n}",
    ],
    [
      "com objeto aninhado antes do verbo",
      "Queue",
      "export interface Queue {\n  opts: { retries: number };\n  push(job: string): void;\n}",
    ],
    ["com o verbo como propriedade", "Clock", "export interface Clock {\n  now: () => Date;\n}"],
    [
      "escrita como type alias",
      "Locker",
      "export type Locker = {\n  lock(key: string): Promise<void>;\n};",
    ],
  ];

  for (const [shape, name, source] of cases) {
    it(`vê a porta ${shape}`, () => {
      expect(interfacesWithVerbs(source)).toEqual([name]);
    });
  }

  it("não confunde forma de dado com porta", () => {
    const source = [
      "export interface PutAssetInput {\n  key: string;\n  meta: { size: number };\n}",
      "export type AiMessage = { role: string } | { tool: string };",
      "/** export interface Fantasma {\n  run(): void;\n} */",
    ].join("\n");

    expect(interfacesWithVerbs(source)).toEqual([]);
  });
});

/**
 * As interfaces e os type aliases de objeto exportados que têm verbo: um método, ou uma
 * propriedade cujo tipo é função. Pela árvore do TypeScript, e não por texto: comentário não
 * conta, genérico, `extends` e objeto aninhado não atrapalham.
 */
function interfacesWithVerbs(code: string): string[] {
  const sourceFile = ts.createSourceFile("portas.ts", code, ts.ScriptTarget.Latest, true);
  const names: string[] = [];

  const hasVerb = (members: ts.NodeArray<ts.TypeElement>) =>
    members.some(
      (member) =>
        ts.isMethodSignature(member) ||
        ts.isCallSignatureDeclaration(member) ||
        (ts.isPropertySignature(member) &&
          member.type !== undefined &&
          ts.isFunctionTypeNode(member.type)),
    );

  const isExported = (node: ts.Node) =>
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

  for (const node of sourceFile.statements) {
    if (!isExported(node)) continue;

    if (ts.isInterfaceDeclaration(node) && hasVerb(node.members)) {
      names.push(node.name.text);
    } else if (
      ts.isTypeAliasDeclaration(node) &&
      ts.isTypeLiteralNode(node.type) &&
      hasVerb(node.type.members)
    ) {
      names.push(node.name.text);
    }
  }

  return names;
}

function walk(dir: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    // `generated` é código do Prisma: varrê-lo custa segundos e não diz nada sobre o desenho.
    if (entry.isDirectory() && entry.name !== "generated") {
      found.push(...walk(path.join(dir, entry.name)));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      found.push(path.join(dir, entry.name));
    }
  }

  return found;
}
