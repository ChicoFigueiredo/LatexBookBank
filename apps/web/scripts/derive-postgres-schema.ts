import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Deriva o schema PostgreSQL a partir do de SQLite (Fase 6.5, D25/D30).
 *
 *     bun run db:derive-postgres
 *
 * **Derivado, e não mantido à mão.** Dois arquivos de schema divergem — sempre —, e divergem no
 * campo que ninguém olha. Um deles vira a verdade e o outro vira uma mentira com aparência de
 * documentação. Aqui o de SQLite é a fonte, e o de PostgreSQL é saída de build.
 *
 * A transformação é pequena de propósito: se um dia precisar ser grande, é sinal de que o schema
 * acumulou construção específica de motor — que é exatamente o que o guard de portabilidade
 * (`tests/schema-portability.test.ts`) existe para impedir.
 */

export interface DerivationResult {
  readonly schema: string;
  /** Ajustes que o PostgreSQL exigiu, para o Cloud Compatibility Report. */
  readonly changes: readonly string[];
}

/**
 * Colunas que **precisam** de `COLLATE "C"` no PostgreSQL.
 *
 * `sortKey` é fractional index em base-62, e base-62 mistura caixa: `Zz` vem antes de `a0` na
 * ordem de bytes. A colação padrão de um PostgreSQL glibc (`en_US.utf8`) ignora caixa e coloca
 * `a0` **antes** de `Zz` — quer dizer, tudo que foi movido para o topo aparece no fim da lista.
 *
 * Medido nesta fase, com chaves geradas pelo próprio gerador da árvore:
 *
 *     colação do banco   a0 a1 a2 a3 a4 Zv Zw Zx Zy ZyG ZyV Zz     ← invertido
 *     COLLATE "C"        Zv Zw Zx Zy ZyG ZyV Zz a0 a1 a2 a3 a4     ← correto
 *
 * A colação vai **na coluna**, e não em cada consulta: é o que faz o `ORDER BY` que o Prisma gera
 * sair certo sem que nenhum caso de uso precise lembrar de pedir. O plano confirma —
 * `Sort Key: k COLLATE "C"`.
 */
const COLLATE_C_COLUMNS: readonly { readonly model: string; readonly field: string }[] = [
  { model: "DocumentNode", field: "sortKey" },
  { model: "QuestionOption", field: "sortKey" },
];

const HEADER = `// ⚠️ GERADO — não edite.
//
// Saída de \`bun run db:derive-postgres\`, a partir de \`schema.prisma\`. Editar aqui é perder a
// edição no próximo build, e pior: fazer os dois motores divergirem em silêncio.
//
// Existe para a Fase 6.5 (D30): provar que banco troca de implementação sem reescrever domínio.
`;

export function derivePostgresSchema(sqliteSchema: string): DerivationResult {
  const changes: string[] = [];
  let schema = sqliteSchema;

  schema = schema.replace(
    /datasource db \{\s*provider = "sqlite"\s*\}/,
    'datasource db {\n  provider = "postgresql"\n}',
  );
  changes.push("`provider` trocado de `sqlite` para `postgresql`.");

  for (const { model, field } of COLLATE_C_COLUMNS) {
    // `@db.Text` com colação não existe no Prisma; a colação entra por SQL na migration. O que dá
    // para fazer aqui é **marcar** a coluna, para o `prisma migrate diff` não ser a única memória
    // dessa exigência.
    const pattern = new RegExp(`(model ${model} \\{[\\s\\S]*?)^(\\s*)${field}(\\s+)String`, "m");
    if (!pattern.test(schema)) {
      throw new Error(`Campo ${model}.${field} não encontrado — a derivação ficaria incompleta.`);
    }
    schema = schema.replace(
      pattern,
      `$1$2/// ⚠️ PostgreSQL exige \`COLLATE "C"\` nesta coluna (D38). Ver \`prisma/postgres-collation.sql\`.\n$2${field}$3String`,
    );
    changes.push(
      `\`${model}.${field}\` marcado como dependente de \`COLLATE "C"\` — sem ela a ordem da árvore inverte.`,
    );
  }

  return { schema: HEADER + "\n" + schema, changes };
}

/**
 * O SQL que o Prisma não sabe gerar.
 *
 * Prisma não tem atributo de colação; esta é a parte que precisa ser aplicada à mão depois do
 * `migrate deploy`. Está num arquivo, e não num comentário, porque comentário não roda.
 */
export function collationSql(): string {
  return [
    "-- Colação das colunas de ordenação (D38, Fase 6.5).",
    "--",
    "-- O `sortKey` é fractional index em base-62, que mistura caixa. A colação padrão de um",
    "-- PostgreSQL glibc ignora caixa e inverte a lista em silêncio — medido: `a0` antes de `Zz`.",
    "-- Aplicar **depois** do `prisma migrate deploy`; o Prisma não tem como expressar isto.",
    "",
    ...COLLATE_C_COLUMNS.map(
      ({ model, field }) =>
        `ALTER TABLE "${model === "DocumentNode" ? "document_nodes" : "question_options"}" ` +
        `ALTER COLUMN "${field}" TYPE text COLLATE "C";`,
    ),
    "",
  ].join("\n");
}

const sqlitePath = fileURLToPath(new URL("../prisma/schema.prisma", import.meta.url));
const postgresPath = fileURLToPath(new URL("../prisma/schema.postgres.prisma", import.meta.url));
const sqlPath = fileURLToPath(new URL("../prisma/postgres-collation.sql", import.meta.url));

const { schema, changes } = derivePostgresSchema(readFileSync(sqlitePath, "utf8"));
writeFileSync(postgresPath, schema, "utf8");
writeFileSync(sqlPath, collationSql(), "utf8");

console.log("Schema PostgreSQL derivado. Ajustes que o motor exigiu:");
for (const change of changes) console.log(`  · ${change}`);
