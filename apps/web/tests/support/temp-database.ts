import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@libsql/client";

/**
 * Um SQLite de verdade, num diretório temporário, com as migrações do repositório aplicadas.
 *
 * Os adaptadores Prisma eram provados no app, ao vivo. As âncoras do nó (D50) têm uma regra que só
 * existe no banco — a coluna antiga em sincronia com a lista, na mesma transação —, e um dublê não
 * a provaria. As migrações são as mesmas que o `prisma migrate` aplica: o banco do teste é o banco
 * do produto, não um esquema escrito à mão para o teste.
 *
 * Uso: `const db = await createTempDatabase()` **antes** de importar qualquer adaptador (o cliente
 * Prisma lê `DATABASE_URL` ao ser importado), e `db.dispose()` no fim.
 */
export async function createTempDatabase(): Promise<{
  readonly url: string;
  dispose(): Promise<void>;
}> {
  const dir = mkdtempSync(path.join(tmpdir(), "lbb-test-db-"));
  const url = `file:${path.join(dir, "test.db")}`;

  const migrations = fileURLToPath(new URL("../../prisma/migrations", import.meta.url));
  const client = createClient({ url });

  for (const entry of readdirSync(migrations, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => item.name)
    .sort()) {
    await client.executeMultiple(readFileSync(path.join(migrations, entry, "migration.sql"), "utf8"));
  }
  client.close();

  process.env["DATABASE_URL"] = url;
  // O cliente Prisma é guardado no `globalThis` para sobreviver ao hot reload; um teste anterior
  // no mesmo processo deixaria o dele ali, apontando para outro arquivo.
  delete (globalThis as Record<string, unknown>)["__latexbookbankPrisma"];

  return {
    url,
    async dispose() {
      const holder = globalThis as Record<string, unknown>;
      const cached = holder["__latexbookbankPrisma"] as { $disconnect?: () => Promise<void> } | undefined;
      await cached?.$disconnect?.();
      delete holder["__latexbookbankPrisma"];
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
