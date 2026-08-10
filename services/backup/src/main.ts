import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { loadConfig, type BackupConfig } from "./config";
import { backupAll, type BackupOutcome } from "./run-backup";
import { writeStatus } from "./status";

/**
 * O serviço de backup — **processo próprio, fora do renderer** (D36).
 *
 * A decisão original punha o backup dentro do worker de render, e a correção existe por um motivo
 * concreto: o renderer roda com a rede de saída bloqueada, sem credencial de banco e sem
 * conhecimento de workspace. Dar-lhe backup significaria devolver tudo isso — e desfazer as três
 * garantias que o isolamento dele comprou.
 *
 * O backup **reutiliza o mesmo `PortableArchiveWriter`** da exportação, pedindo o arquivo ao app
 * por HTTP. Nenhum formato paralelo: um backup que se escreve sozinho é um backup cuja
 * restauração ninguém testou, e a hora de descobrir isso é sempre a pior possível. Como o arquivo
 * é byte a byte o da exportação manual, o round-trip que valida uma valida a outra.
 *
 * Por consequência, este processo **não tem `DATABASE_URL`**, não toca o storage e não sabe o que
 * é um workspace. A primeira versão importava o exportador direto de `apps/web` e quebrou no
 * `import "server-only"` — o guarda avisando que aquele módulo é do servidor do app, e que um
 * segundo processo no mesmo banco seria um segundo escritor daquele schema.
 *
 * `--once` roda uma vez e sai; é o modo do cron externo e o modo do teste.
 *
 * Ver D32 · D36 · issue #117.
 */

async function runOnce(config: BackupConfig): Promise<BackupOutcome> {
  await mkdir(config.destination, { recursive: true });

  const outcome = await backupAll(config);

  for (const archive of outcome.archives) {
    await writeFile(join(config.destination, archive.filename), archive.bytes);
  }

  await prune(config);
  await writeStatus(config.destination, outcome);

  return outcome;
}

/**
 * Apaga os mais antigos, por workspace.
 *
 * Por workspace e não no diretório inteiro: um acervo com uma biblioteca e outro com dez não
 * podem competir pelo mesmo teto, ou o segundo apagaria o histórico do primeiro na primeira
 * rodada.
 */
async function prune(config: BackupConfig): Promise<void> {
  const files = (await readdir(config.destination)).filter((name) => name.endsWith(".lbb"));

  const byWorkspace = new Map<string, string[]>();
  for (const name of files) {
    // `<slug>--<timestamp>.lbb` — o separador duplo evita confundir com hífen de slug.
    const slug = name.split("--")[0] ?? name;
    byWorkspace.set(slug, [...(byWorkspace.get(slug) ?? []), name]);
  }

  for (const names of byWorkspace.values()) {
    // O nome carrega o instante em ISO, então ordem alfabética **é** ordem cronológica.
    const sorted = [...names].sort().reverse();
    for (const stale of sorted.slice(config.keep)) {
      await unlink(join(config.destination, stale));
    }
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const once = process.argv.includes("--once");

  const tick = async (): Promise<void> => {
    try {
      const outcome = await runOnce(config);
      console.log(
        `[backup] ${outcome.archives.length} workspace(s) · ` +
          `${outcome.archives.reduce((total, a) => total + a.bytes.byteLength, 0)} bytes` +
          (outcome.failures.length > 0 ? ` · ${outcome.failures.length} falha(s)` : ""),
      );
    } catch (error) {
      // Falha de backup **nunca** é silenciosa: vai para o log e para o arquivo de estado, que a
      // página de diagnóstico lê. Um backup que falha sem avisar é pior que nenhum, porque cria a
      // impressão de que existe.
      console.error("[backup] falhou:", error);
      await writeStatus(config.destination, {
        archives: [],
        failures: [{ workspaceId: "*", message: String(error) }],
      }).catch(() => undefined);
    }
  };

  await tick();
  if (once) return;

  console.log(`[backup] a cada ${Math.round(config.intervalMs / 60_000)} min`);
  setInterval(() => void tick(), config.intervalMs);
}

void main();
