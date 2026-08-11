#!/usr/bin/env node
/**
 * `bun run setup` — deixa o ambiente local pronto, e diz claramente o que falta.
 *
 * A ordem de importância vem da segunda auditoria (§19, §21): o caminho principal do render é o
 * worker em Docker, então **Docker é a dependência obrigatória e o TeX do host é fallback
 * opcional**. Um TeX ausente não pode impedir ninguém de começar a trabalhar.
 *
 * Nada de instalação silenciosa de software de sistema (spec §26).
 */

import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { copyFile, mkdir, access } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { ensureEnvValue, readEnvValue } from "./env-file.mjs";

const run = promisify(execFile);
const root = fileURLToPath(new URL("..", import.meta.url));
const web = path.join(root, "apps/web");

const OBLIGATORY = "obrigatória";
const OPTIONAL = "opcional";

const symbols = { ok: "✓", warn: "○", fail: "✗" };
const results = [];

const record = (name, status, detail, level) => {
  results.push({ name, status, detail, level });
  const symbol = symbols[status];
  const suffix = detail ? `  ${detail}` : "";
  console.log(`  ${symbol} ${name}${suffix}`);
};

/**
 * Roda um comando e devolve a versão, ou null se o binário não existir.
 *
 * Lê stdout **e** stderr: `pdftocairo -v` sai com código 0 mas escreve em stderr, e uma sonda
 * que só olhasse stdout reportaria como ausente algo que está instalado — mandando o usuário
 * instalar o que já tem.
 */
async function probe(command, args) {
  try {
    const { stdout, stderr } = await run(command, args, { timeout: 15_000 });
    const output = (stdout.trim() || stderr.trim()).trim();
    return output || null;
  } catch (error) {
    // Alguns binários sinalizam `--version` com exit code não-zero mas ainda imprimem a versão.
    const output = `${error?.stdout ?? ""}${error?.stderr ?? ""}`.trim();
    return output || null;
  }
}

const firstLine = (text) => text?.split("\n")[0]?.trim() ?? "";

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

// ─── 1. Diretórios locais ────────────────────────────────────────────────────

console.log("\nDiretórios");
for (const dir of ["data", "data/storage"]) {
  await mkdir(path.join(web, dir), { recursive: true });
}
record("apps/web/data", "ok", "criado");

// ─── 2. Ambiente ─────────────────────────────────────────────────────────────

console.log("\nAmbiente");
const envLocal = path.join(web, ".env.local");
const envExample = path.join(web, ".env.example");

if (await exists(envLocal)) {
  record(".env.local", "ok", "já existe, preservado");
} else {
  await copyFile(envExample, envLocal);
  record(".env.local", "ok", "criado a partir de .env.example");
}

// ─── 3. Dependências externas ────────────────────────────────────────────────

console.log("\nDependências externas");

const bunVersion = await probe("bun", ["--version"]);
record(
  "Bun",
  bunVersion ? "ok" : "fail",
  bunVersion ?? "ausente",
  bunVersion ? OPTIONAL : OBLIGATORY,
);

const docker = await probe("docker", ["--version"]);
if (docker) {
  record("Docker", "ok", firstLine(docker), OBLIGATORY);
} else {
  record("Docker", "fail", "ausente — o worker de render (Fase 6) roda nele", OBLIGATORY);
}

// TeX no host: fallback opcional. O caminho principal é a imagem do worker.
const pdflatex = await probe("pdflatex", ["--version"]);
record(
  "pdflatex (host)",
  pdflatex ? "ok" : "warn",
  pdflatex ? firstLine(pdflatex) : "ausente — fallback opcional, não bloqueia",
  OPTIONAL,
);

const pdftocairo = await probe("pdftocairo", ["-v"]);
record(
  "pdftocairo (host)",
  pdftocairo ? "ok" : "warn",
  pdftocairo ? firstLine(pdftocairo) : "ausente — fallback opcional, não bloqueia",
  OPTIONAL,
);

// ─── 3.1 Segredo do worker ───────────────────────────────────────────────────
//
// O mesmo segredo precisa estar em **dois** arquivos: o `.env` da raiz, que o `docker compose`
// lê, e o `.env.local` da app, que é quem manda o cabeçalho. Até aqui isso estava escrito num
// comentário do `.env.example` — quer dizer, quem clonava o repositório descobria lendo, e o
// sintoma de errar era a rota de render devolvendo 503 sem dizer que os dois valores divergiam.
//
// Gerar aqui é diferente de o worker gerar sozinho, que a Fase 6 recusou de propósito: lá ele
// subiria "funcionando" e ninguém saberia que estava aberto. Aqui o valor é escrito em arquivo,
// pertence a quem rodou o comando, e o próprio comando diz que gerou.

const rootEnv = path.join(root, ".env");

console.log("\nWorker de render");

const secretFromRoot = await readEnvValue(rootEnv, "RENDERER_SECRET");
const secretFromApp = await readEnvValue(envLocal, "RENDERER_SECRET");

// A raiz manda quando os dois divergem: é ela que o contêiner **já rodando** está usando, e
// trocar o segredo dele para casar com a app derrubaria o worker de quem só rodou `setup`.
const secret = secretFromRoot ?? secretFromApp ?? randomBytes(36).toString("base64");
const secretOrigin =
  secretFromRoot !== null ? ".env da raiz" : secretFromApp !== null ? ".env.local" : "gerado agora";

const comentario =
  "# Escrito por `bun run setup`: precisa ser **o mesmo** valor do `.env` da raiz, que o compose\n" +
  "# lê. Divergir entre os dois dá 401 no worker, e a app não tem como explicar isso.";

// Sem aspas na raiz (o compose não as remove) e com aspas no `.env.local`, que é o formato do
// resto do arquivo. Os dois recebem o valor **cru** — ver o comentário em `ensureEnvValue`.
await ensureEnvValue(rootEnv, "RENDERER_SECRET", secret);
await ensureEnvValue(envLocal, "RENDERER_BASE_URL", "http://127.0.0.1:28900", {
  comment: comentario,
  quote: true,
});
await ensureEnvValue(envLocal, "RENDERER_SECRET", secret, { quote: true });

record(
  "RENDERER_SECRET",
  "ok",
  `${secretOrigin}; sincronizado entre .env e .env.local`,
  OBLIGATORY,
);

// A imagem: obrigatória pela §19 da segunda auditoria, e é o passo mais caro do setup — ela leva
// TeX Live inteiro. Só constrói quando não existe; reconstruir a cada `setup` cobraria minutos de
// quem só queria rodar as migrations.
const hasImage = await probe("docker", ["image", "inspect", "latexbookbank/renderer:dev"]);
const imageExists = hasImage !== null && !hasImage.startsWith("Error");

if (!docker) {
  record("imagem do renderer", "fail", "Docker ausente", OBLIGATORY);
} else if (imageExists) {
  record("imagem do renderer", "ok", "já construída (`docker compose build renderer` refaz)");
} else {
  console.log("    construindo a imagem do renderer — leva minutos, é TeX Live inteiro…");
  try {
    await run("docker", ["compose", "build", "renderer"], { cwd: root, timeout: 1_800_000 });
    record("imagem do renderer", "ok", "construída", OBLIGATORY);
  } catch (error) {
    record("imagem do renderer", "fail", firstLine(String(error)), OBLIGATORY);
  }
}

// E o `/health`, que é o que separa "a imagem existe" de "o worker responde".
if (docker) {
  try {
    await run("docker", ["compose", "up", "-d", "renderer", "renderer-ingress"], {
      cwd: root,
      timeout: 180_000,
    });

    // Espera ativa curta: o worker sobe em segundos, e um `sleep` fixo ou erraria para mais
    // (tempo perdido em toda execução) ou para menos (falso negativo em máquina carregada).
    let health = null;
    for (let tentativa = 0; tentativa < 20 && health === null; tentativa += 1) {
      const body = await probe("curl", ["-s", "-m", "2", "http://127.0.0.1:28900/health"]);
      if (body?.includes('"status"')) health = body;
      else await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (health === null) {
      record("GET /health", "fail", "worker não respondeu em 10 s", OBLIGATORY);
    } else {
      const version = /"pdfLatexVersion":"([^"]*)"/.exec(health)?.[1] ?? "";
      record("GET /health", "ok", version || "respondendo em 28900", OBLIGATORY);
    }
  } catch (error) {
    record("subir o worker", "fail", firstLine(String(error)), OBLIGATORY);
  }
}

// ─── 4. Banco ────────────────────────────────────────────────────────────────

console.log("\nBanco");
try {
  await run("bun", ["x", "prisma", "migrate", "deploy"], { cwd: web, timeout: 120_000 });
  record("migrations", "ok", "aplicadas");

  await run("bun", ["x", "prisma", "generate"], { cwd: web, timeout: 120_000 });
  record("Prisma Client", "ok", "gerado");

  // O seed só roda quando o banco está vazio: rodá-lo de novo duplicaria a publicação demo,
  // porque `create` não é idempotente como o `upsert` do workspace.
  await run("bun", ["x", "prisma", "db", "seed"], { cwd: web, timeout: 120_000 });
  record("seed", "ok", "aplicado");
} catch (error) {
  record("migrations", "fail", String(error).split("\n")[0], OBLIGATORY);
}

// ─── 5. Provider de IA ───────────────────────────────────────────────────────

console.log("\nIA");
const ollama = await probe("curl", ["-s", "-m", "2", "http://127.0.0.1:11434/api/tags"]);
record(
  "Ollama local",
  ollama ? "ok" : "warn",
  ollama ? "respondendo em 11434" : "não respondendo — informativo, a IA chega na Fase 8",
  OPTIONAL,
);

// ─── Resumo ──────────────────────────────────────────────────────────────────

const blocking = results.filter((r) => r.status === "fail" && r.level === OBLIGATORY);

console.log("");
if (blocking.length === 0) {
  console.log("Ambiente pronto.  bun run dev  →  http://localhost:28080\n");
} else {
  console.log("Faltam dependências obrigatórias:\n");
  for (const item of blocking) console.log(`  ✗ ${item.name} — ${item.detail}`);
  console.log("\nNada foi instalado automaticamente: instale e rode `bun run setup` de novo.\n");
  process.exitCode = 1;
}
