import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * O servidor do E2E: um `next dev` com banco e storage só dele (#241).
 *
 * Antes o Playwright reaproveitava o servidor da `28080`, que aponta para o acervo. Um spec
 * esvaziava a lixeira inteira, outro apagava o complemento de uma questão real, outro editava
 * questões que o scan aprovou — e cada execução deixava bibliotecas "Acervo …" na estante.
 *
 * Aqui tudo nasce de novo a cada execução, em `data/e2e/` (ignorado pelo git, e fica de pé depois
 * para inspecionar uma falha): as migrações do repositório, o seed de demonstração e o servidor
 * com `LBB_INSTANCE=e2e`, que o `global-setup.ts` confere antes do primeiro teste.
 *
 * Só roda um `next dev` por pasta: com o dev server de todo dia de pé, este não sobe e o E2E
 * falha antes de tocar em qualquer coisa. Pare o outro antes.
 *
 * Uso (o `playwright.config.ts` já chama): `bun e2e/server.ts <porta>`.
 */

const port = process.argv[2];
if (!port || !/^\d+$/.test(port)) throw new Error("uso: bun e2e/server.ts <porta>");

const app = fileURLToPath(new URL("..", import.meta.url));
const root = path.join(app, "data", "e2e");

rmSync(root, { recursive: true, force: true });
mkdirSync(path.join(root, "storage"), { recursive: true });

// O `.env.local` continua valendo para o resto (worker de render, IA); estas três chaves vêm
// antes dele — nem o Next, nem o Prisma, nem o Bun sobrescrevem o que já está no ambiente.
const env = {
  ...process.env,
  DATABASE_URL: `file:${path.join(root, "latexbookbank.db")}`,
  STORAGE_ROOT: path.join(root, "storage"),
  LBB_INSTANCE: "e2e",
};

const step = (command: string, args: readonly string[]) => {
  const result = spawnSync(command, args, { cwd: app, env, stdio: "inherit" });
  if (result.status !== 0)
    throw new Error(`${command} ${args.join(" ")} falhou (${result.status})`);
};

step("bunx", ["prisma", "migrate", "deploy"]);
step("bun", ["prisma/seed.ts"]);

const server = spawn("bunx", ["next", "dev", "-H", "127.0.0.1", "--port", port], {
  cwd: app,
  env,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.kill(signal));
}
server.on("exit", (code) => process.exit(code ?? 0));
