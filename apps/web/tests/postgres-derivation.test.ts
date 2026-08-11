import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { collationSql, derivePostgresSchema } from "../scripts/derive-postgres-schema";

/**
 * A derivação do schema PostgreSQL (Fase 6.5, D25/D30).
 *
 * O que estes testes protegem não é o script — é a **transformação continuar pequena**. Se um dia
 * ela precisar crescer, é sinal de que o schema acumulou construção específica de motor, e aí o
 * spike da 6.5 deixou de ser um spike.
 */

const sqliteSchema = readFileSync(
  fileURLToPath(new URL("../prisma/schema.prisma", import.meta.url)),
  "utf8",
);

describe("derivePostgresSchema", () => {
  it("troca o provider", () => {
    const { schema } = derivePostgresSchema(sqliteSchema);

    expect(schema).toContain('provider = "postgresql"');
    expect(schema).not.toContain('provider = "sqlite"');
  });

  it("marca o arquivo como gerado", () => {
    // Editar o derivado é perder a edição no próximo build, e pior: fazer os dois motores
    // divergirem em silêncio.
    expect(derivePostgresSchema(sqliteSchema).schema.startsWith("// ⚠️ GERADO")).toBe(true);
  });

  it("marca as duas colunas de ordenação", () => {
    const { changes } = derivePostgresSchema(sqliteSchema);

    expect(changes.some((c) => c.includes("DocumentNode.sortKey"))).toBe(true);
    expect(changes.some((c) => c.includes("QuestionOption.sortKey"))).toBe(true);
  });

  it("**falha** se um `sortKey` sumir do schema", () => {
    // Renomear a coluna sem atualizar a derivação produziria um schema PostgreSQL sem a colação,
    // e a árvore inverteria em produção sem nada acusar. Melhor quebrar o build.
    const semSortKey = sqliteSchema.replace(/sortKey(\s+)String/g, "ordem$1String");

    expect(() => derivePostgresSchema(semSortKey)).toThrow(/não encontrado/);
  });

  it("a transformação é pequena — três ajustes, não trinta", () => {
    // O guard de portabilidade impede o schema de acumular construção de um motor só; este
    // teste é o outro lado da mesma moeda.
    expect(derivePostgresSchema(sqliteSchema).changes.length).toBeLessThanOrEqual(4);
  });
});

describe("collationSql", () => {
  it("altera as duas tabelas, com os nomes do `@@map`", () => {
    const sql = collationSql();

    expect(sql).toContain(
      'ALTER TABLE "document_nodes" ALTER COLUMN "sortKey" TYPE text COLLATE "C"',
    );
    expect(sql).toContain('ALTER TABLE "question_options"');
  });

  it("está num arquivo `.sql`, não num comentário", () => {
    // Comentário não roda. O Prisma não tem atributo de colação, então esta é a parte que
    // precisa ser aplicada de verdade depois do `migrate deploy`.
    const file = readFileSync(
      fileURLToPath(new URL("../prisma/postgres-collation.sql", import.meta.url)),
      "utf8",
    );
    expect(file).toContain('COLLATE "C"');
  });
});
