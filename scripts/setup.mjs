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

import { execFile } from "node:child_process";
import { copyFile, mkdir, access } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

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
