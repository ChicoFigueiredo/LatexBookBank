import "server-only";

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

import { PrismaClient } from "@/generated/prisma/client";

/**
 * Cliente Prisma — **server-only**.
 *
 * O import de `server-only` no topo faz o build falhar se algum Client Component alcançar este
 * módulo, mesmo por engano transitivo. É a mesma fronteira que o lint já protege (`domain/**`
 * não importa prisma), aqui reforçada pelo bundler: duas redes, porque uma falha em silêncio.
 *
 * O Prisma 7 exige driver adapter; o endereço do banco vem de `DATABASE_URL`, nunca de literal.
 */

const createClient = (): PrismaClient => {
  const url = process.env["DATABASE_URL"];

  if (!url) {
    throw new Error(
      "DATABASE_URL ausente. Rode `pnpm setup` ou copie `.env.example` para `.env.local`.",
    );
  }

  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });
};

/**
 * Em desenvolvimento o hot reload reavalia módulos a cada alteração; sem o cache global, cada
 * recarga abriria uma conexão nova até o SQLite reclamar.
 */
const globalForPrisma = globalThis as typeof globalThis & {
  __latexbookbankPrisma?: PrismaClient;
};

export const prisma: PrismaClient = globalForPrisma.__latexbookbankPrisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__latexbookbankPrisma = prisma;
}
