import { defineConfig, env } from "prisma/config";

/**
 * Configuração do spike PostgreSQL (Fase 6.5, D30).
 *
 * Arquivo separado porque o Prisma 7 resolve o schema pelo config, e `--schema` deixou de valer
 * em `db push`. É **efêmero por natureza**: existe para o spike provar que o domínio atravessa a
 * troca de motor, e o desenvolvimento continua local (D21).
 *
 *     DATABASE_URL=postgresql://... bunx prisma db push --config=prisma.postgres.config.ts
 *
 * Sem `seed` e sem `migrations.path`: o spike usa `db push` contra um banco descartável, e criar
 * uma segunda pasta de migrations faria as duas divergirem — que é exatamente o que a derivação
 * do schema existe para evitar.
 */
export default defineConfig({
  schema: "prisma/schema.postgres.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
