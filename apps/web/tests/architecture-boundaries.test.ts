import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Cada fronteira arquitetural é exercitada com uma **violação proposital**.
 *
 * O checklist é explícito: um item de boundary só pode ser marcado quando existe a demonstração
 * de que o lint recusa. Este arquivo é essa demonstração, automatizada — se alguém afrouxar uma
 * regra, o teste fica vermelho antes de o import errado chegar ao código de produção.
 *
 * Ver `docs/_atual/_checklist.md` › Fase 0 › "Regras de boundary" e o planejamento §4.5.
 */

const cwd = fileURLToPath(new URL("..", import.meta.url));

let eslint: ESLint;

// A primeira invocação carrega o flat config inteiro e leva alguns segundos; as seguintes
// levam dezenas de milissegundos. Aquecer aqui evita que o primeiro caso pague essa conta.
beforeAll(async () => {
  eslint = new ESLint({ cwd });
  await eslint.lintText("export const warmup = 1;\n", {
    filePath: "src/modules/questions/domain/warmup.ts",
  });
}, 60_000);

/** Linta um trecho como se fosse um arquivo naquele caminho, e devolve as mensagens de erro. */
async function lintAs(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? [])
    .filter((message) => message.severity === 2)
    .map((message) => message.message);
}

const DOMAIN_FILE = "src/modules/questions/domain/violation.ts";
const UI_FILE = "src/modules/questions/ui/Violation.tsx";
const AGENT_FILE = "src/modules/agents/domain/violation.ts";
const APPLICATION_FILE = "src/modules/questions/application/allowed.ts";

describe("domínio não conhece infraestrutura", () => {
  const forbidden: ReadonlyArray<readonly [string, string]> = [
    ["Prisma", `import { PrismaClient } from "@prisma/client";\nexport const c = PrismaClient;`],
    ["Next.js", `import { NextResponse } from "next/server";\nexport const r = NextResponse;`],
    ["filesystem", `import { readFileSync } from "node:fs";\nexport const r = readFileSync;`],
    [
      "processo externo",
      `import { execFile } from "node:child_process";\nexport const e = execFile;`,
    ],
    ["SDK de storage", `import { put } from "@vercel/blob";\nexport const p = put;`],
    ["SDK de IA", `import OpenAI from "openai";\nexport const o = OpenAI;`],
    [
      "infraestrutura",
      `import { db } from "@infrastructure/database/sqlite/client";\nexport const d = db;`,
    ],
  ];

  for (const [label, code] of forbidden) {
    it(`rejeita import de ${label}`, async () => {
      const messages = await lintAs(DOMAIN_FILE, code);
      expect(messages.join("\n")).toMatch(/Domínio não/);
    });
  }

  it("aceita import de outro módulo de domínio", async () => {
    const messages = await lintAs(
      DOMAIN_FILE,
      `import type { QuestionOption } from "./option";\nexport type Q = QuestionOption;`,
    );
    expect(messages).toHaveLength(0);
  });
});

describe("componente React não acessa o banco", () => {
  it("rejeita import de Prisma", async () => {
    const messages = await lintAs(
      UI_FILE,
      `import { PrismaClient } from "@prisma/client";\nexport const C = () => null;\nexport const c = PrismaClient;`,
    );
    expect(messages.join("\n")).toMatch(/Componente React não acessa/);
  });

  it("rejeita import da camada de banco", async () => {
    const messages = await lintAs(
      UI_FILE,
      `import { db } from "@infrastructure/database/sqlite/client";\nexport const C = () => null;\nexport const d = db;`,
    );
    expect(messages.join("\n")).toMatch(/Componente React não acessa/);
  });
});

describe("agente propõe, nunca escreve", () => {
  it("rejeita import de Prisma", async () => {
    const messages = await lintAs(
      AGENT_FILE,
      `import { PrismaClient } from "@prisma/client";\nexport const c = PrismaClient;`,
    );
    expect(messages.join("\n")).toMatch(/O agente não tem caminho de escrita/);
  });

  it("rejeita import da camada de banco", async () => {
    const messages = await lintAs(
      AGENT_FILE,
      `import { db } from "@infrastructure/database/sqlite/client";\nexport const d = db;`,
    );
    expect(messages.join("\n")).toMatch(/O agente não acessa a camada de banco/);
  });
});

describe("a camada de application continua livre", () => {
  it("pode orquestrar infraestrutura", async () => {
    const messages = await lintAs(
      APPLICATION_FILE,
      `import type { StorageProvider } from "@infrastructure/storage/local/provider";\nexport type S = StorageProvider;`,
    );
    expect(messages).toHaveLength(0);
  });
});
