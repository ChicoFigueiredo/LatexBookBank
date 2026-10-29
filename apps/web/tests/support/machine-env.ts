import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Uma variável de endereço de máquina: do ambiente, ou do `apps/web/.env.local`.
 *
 * Endereço de máquina mora só no `.env.local`, nunca no código (ver `.env.example`). Os testes que
 * dependem de arquivo fora do repositório leem o caminho daqui, e se pulam **dizendo qual variável
 * falta** quando ela não está definida — em vez de embutir um caminho desta máquina como padrão e
 * se pular calados no dia em que o acervo muda de lugar (TST-14 da revisão de 2026-09-23).
 */
export function machineEnv(name: string): string | null {
  const direct = process.env[name];
  if (direct) return direct;

  const envFile = fileURLToPath(new URL("../../.env.local", import.meta.url));
  if (!existsSync(envFile)) return null;

  const line = readFileSync(envFile, "utf8")
    .split("\n")
    .find((entry) => entry.startsWith(`${name}=`));
  const value = line
    ?.slice(name.length + 1)
    .trim()
    .replace(/^"|"$/g, "");
  return value ? value : null;
}
