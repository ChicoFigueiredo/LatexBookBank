import { existsSync } from "node:fs";

import { defineConfig, env } from "prisma/config";

// O Prisma 7 deixou de carregar `.env` sozinho. `process.loadEnvFile` é nativo do Node ≥ 20.12,
// então não precisamos de `dotenv` só para isto.
for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

/**
 * Prisma 7 tirou a `url` do `schema.prisma`: a conexão de migrate mora aqui, e o runtime usa um
 * driver adapter (ver `src/infrastructure/database/sqlite/client.ts`).
 *
 * O efeito colateral é bom para nós — o endereço do banco passa a ser configuração de ambiente
 * de verdade, não um literal dentro do schema. É o que D33 pedia sem que precisássemos forçar.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node --experimental-strip-types prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
