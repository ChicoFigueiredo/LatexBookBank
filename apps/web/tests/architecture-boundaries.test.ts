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

/**
 * Os furos que a revisão de 2026-09-23 mediu (TST-07, #273): cada um destes imports passava pelo
 * lint, que só negava as formas com alias. Um caso por furo, no caminho em que ele foi medido.
 */
describe("os furos medidos na revisão de 2026-09-23", () => {
  const REPOSITORIO_PRISMA = `import { PrismaQuestionRepository } from "@modules/questions/infrastructure/prisma-question-repository";\nexport const R = PrismaQuestionRepository;`;

  it("domínio não importa a infraestrutura de outro módulo", async () => {
    const messages = await lintAs(DOMAIN_FILE, REPOSITORIO_PRISMA);
    expect(messages.join("\n")).toMatch(/Domínio não importa infraestrutura/);
  });

  it("domínio não alcança a infraestrutura por caminho relativo", async () => {
    const messages = await lintAs(
      DOMAIN_FILE,
      `import { db } from "../../../infrastructure/database/sqlite/client";\nexport const d = db;`,
    );
    expect(messages.join("\n")).toMatch(/Domínio não importa infraestrutura/);
  });

  it("domínio não usa import() dinâmico, que o no-restricted-imports não enxerga", async () => {
    const messages = await lintAs(
      DOMAIN_FILE,
      `export async function ler() {\n  const fs = await import("node:fs");\n  return fs;\n}`,
    );
    expect(messages.join("\n")).toMatch(/Domínio não carrega módulo em tempo de execução/);
  });

  it("domínio não usa require, pelo mesmo motivo", async () => {
    const messages = await lintAs(
      DOMAIN_FILE,
      `export function ler() {\n  return require("node:fs");\n}`,
    );
    expect(messages.join("\n")).toMatch(/Domínio não carrega módulo em tempo de execução/);
  });

  it("domínio não conhece o driver do banco", async () => {
    const messages = await lintAs(
      DOMAIN_FILE,
      `import { createClient } from "@libsql/client";\nexport const c = createClient;`,
    );
    expect(messages.join("\n")).toMatch(/Domínio não conhece o driver/);
  });

  it("o agente não alcança o PatchApplier", async () => {
    const messages = await lintAs(
      "src/modules/agents/application/violation.ts",
      `import { PrismaPatchApplier } from "@infrastructure/agent/prisma-patch-applier";\nexport const P = PrismaPatchApplier;`,
    );
    expect(messages.join("\n")).toMatch(/O agente não aplica patch/);
  });

  it("o agente não importa a infraestrutura de outro módulo", async () => {
    const messages = await lintAs(AGENT_FILE, REPOSITORIO_PRISMA);
    expect(messages.join("\n")).toMatch(/O agente não acessa/);
  });

  it("o domínio do agente continua sendo domínio: o bloco do agente não apaga o do domínio", async () => {
    // Em flat config o último bloco que casa substitui `no-restricted-imports` inteiro. O do agente
    // vinha depois do de domínio, e em `agents/domain` o filesystem passava.
    const messages = await lintAs(
      AGENT_FILE,
      `import { readFileSync } from "node:fs";\nexport const r = readFileSync;`,
    );
    expect(messages.join("\n")).toMatch(/Domínio não toca o filesystem/);
  });

  it("componente React não importa o repositório Prisma de um módulo", async () => {
    const messages = await lintAs(UI_FILE, `${REPOSITORIO_PRISMA}\nexport const C = () => null;`);
    expect(messages.join("\n")).toMatch(/Componente React não importa infraestrutura/);
  });

  it("sem exceção: o antigo caminho do MathJax em infrastructure cai na regra", async () => {
    // O MathJax do preview foi a exceção nomeada até sair de `infrastructure/` (frente I). Um
    // `preview/infrastructure/mathjax` novo seria a volta dela, e cai na regra como qualquer outro.
    const messages = await lintAs(
      "src/modules/preview/ui/Allowed.tsx",
      `import { renderMath } from "@modules/preview/infrastructure/mathjax";\nexport const R = renderMath;`,
    );
    expect(messages.join("\n")).toMatch(/Componente React não importa infraestrutura/);
  });

  it("o MathJax do preview é da UI: o componente o importa sem exceção nenhuma", async () => {
    const messages = await lintAs(
      "src/modules/preview/ui/Allowed.tsx",
      `import { renderMath } from "@modules/preview/ui/render-math";\nexport const R = renderMath;`,
    );
    expect(messages).toHaveLength(0);
  });

  it("o SQL cru continua barrado no domínio, mesmo com a regra de import dinâmico ao lado", async () => {
    // As duas são `no-restricted-syntax`; se a nova viesse num bloco separado, apagaria a outra.
    const messages = await lintAs(
      DOMAIN_FILE,
      `export const q = (db: { $queryRaw: unknown }) => db.$queryRaw;`,
    );
    expect(messages.join("\n")).toMatch(/SQL cru fora de infrastructure/);
  });
});

/**
 * O bloco de tokens vem depois do de fronteira e também define `no-restricted-syntax`: escrito só
 * com os seletores de cor, ele apagava ali o SQL cru e, em `agents/ui`, o `import()`/`require`
 * (H3). Cada caso prova que as duas regras valem juntas no mesmo arquivo.
 */
describe("a aderência aos tokens não apaga a fronteira", () => {
  const SQL_CRU = `export const q = (db: { $queryRaw: unknown }) => db.$queryRaw;`;
  const COR_LITERAL = `export const cor = "#ff0000";`;

  for (const filePath of [
    "src/modules/questions/ui/Violation.tsx",
    "app/publications/violation.tsx",
  ]) {
    it(`SQL cru e cor literal são recusados juntos em ${filePath}`, async () => {
      const messages = (await lintAs(filePath, `${SQL_CRU}\n${COR_LITERAL}`)).join("\n");
      expect(messages).toMatch(/SQL cru fora de infrastructure/);
      expect(messages).toMatch(/Cor literal fora do contrato de tokens/);
    });
  }

  it("a UI do agente continua sem import() nem require, e sem cor literal", async () => {
    const messages = (
      await lintAs(
        "src/modules/agents/ui/Violation.tsx",
        `export async function ler() {\n  return [await import("node:fs"), require("node:fs")];\n}\n${SQL_CRU}\n${COR_LITERAL}`,
      )
    ).join("\n");
    expect(messages).toMatch(/O agente não carrega módulo em tempo de execução: import\(\)/);
    expect(messages).toMatch(/O agente não carrega módulo em tempo de execução: require/);
    expect(messages).toMatch(/SQL cru fora de infrastructure/);
    expect(messages).toMatch(/Cor literal fora do contrato de tokens/);
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

/**
 * Radix é a única dependência visual de terceiro (D13). Confinada em `overlays/`, ela cobre as
 * três lacunas do DS sem virar um segundo sistema de componentes rodando em paralelo.
 */
describe("Radix confinado a design-system/overlays", () => {
  const IMPORT = `import * as Tooltip from "@radix-ui/react-tooltip";\nexport const T = Tooltip;`;

  const forbidden = [
    ["página", "app/publications/violation.tsx"],
    ["módulo de feature", "src/modules/questions/ui/Violation.tsx"],
    ["componente portado do DS", "src/design-system/forms/Violation.tsx"],
    ["shell", "src/design-system/shell/Violation.tsx"],
  ] as const;

  for (const [label, filePath] of forbidden) {
    it(`rejeita import direto em ${label}`, async () => {
      const messages = await lintAs(filePath, IMPORT);
      expect(messages.join("\n")).toMatch(/Radix só em src\/design-system\/overlays/);
    });
  }

  it("permite dentro de overlays/", async () => {
    const messages = await lintAs("src/design-system/overlays/Allowed.tsx", IMPORT);
    expect(messages).toHaveLength(0);
  });
});
