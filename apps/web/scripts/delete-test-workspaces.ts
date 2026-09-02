/**
 * Apaga as bibliotecas de resíduo de teste — as ~1.300 que a suíte E2E criou no banco de
 * desenvolvimento e nunca limpou (achado de 2026-09-02: `acervo-e2e-*`, `acervo-captura-*`,
 * `acervo-lixeira-*` e afins, todas com epoch de 13 dígitos no slug).
 *
 * O critério é **negativo e nominal**: fica quem tem `legacyId` (o acervo KnowChico importado de
 * verdade) e quem está na lista de preservadas; cai quem tem cara de máquina — slug com epoch de
 * 13 dígitos — ou está na pequena lista de sondas conhecidas sem epoch. Nome ambíguo não cai:
 * na dúvida, o script deixa e lista como "não classificado", porque apagar biblioteca é
 * permanente (não há lixeira nesse nível — ver `deleteLibrary`).
 *
 * A exclusão vai pela **rota real** (`DELETE /api/libraries/:id`), com o dev server de pé, em vez
 * de reimplementar a transação aqui: `PrismaLibraryRepository` é `server-only`, e duplicar a
 * lógica de cascata (questões, âncoras, avaliações, storage) num script é exatamente o tipo de
 * cópia que apodrece. O custo é precisar do servidor rodando; o ganho é que o caminho exercitado
 * é o mesmo da tela.
 *
 *     APP_URL=http://localhost:28080 bun run scripts/delete-test-workspaces.ts            # dry-run
 *     APP_URL=http://localhost:28080 CONFIRM=yes bun run scripts/delete-test-workspaces.ts
 */
import { Database } from "bun:sqlite";

/** Slug gerado por teste: termina (ou contém) um epoch em milissegundos de 13 dígitos. */
const EPOCH = /-1\d{12}(?:-|$)/;

/** Sondas conhecidas sem epoch no slug — conferidas uma a uma no inventário de 2026-09-02. */
const SONDAS_SEM_EPOCH = new Set([
  "acervo-calibre-real",
  "teste-lixeira-api",
  "probe-apelido-10288",
  "probe-restore-7335",
]);

/** O que fica mesmo sem `legacyId`: a demo semeada e o acervo feito à mão. */
const PRESERVADAS = new Set(["demo", "acervo-de-teste"]);

async function main(): Promise<void> {
  const appUrl = process.env["APP_URL"];
  const confirmed = process.env["CONFIRM"] === "yes";
  if (!appUrl) {
    console.error("APP_URL é obrigatória (ex.: http://localhost:28080, com o dev server de pé).");
    process.exitCode = 1;
    return;
  }

  const db = new Database("data/latexbookbank.db", { readonly: true });
  const rows = db
    .query<{ id: string; slug: string; name: string; legacyId: number | null }, []>(
      "SELECT id, slug, name, legacyId FROM workspaces ORDER BY slug",
    )
    .all();
  db.close();

  const alvos: typeof rows = [];
  const naoClassificadas: typeof rows = [];
  let preservadas = 0;

  for (const row of rows) {
    if (row.legacyId !== null || PRESERVADAS.has(row.slug)) {
      preservadas++;
    } else if (EPOCH.test(row.slug) || SONDAS_SEM_EPOCH.has(row.slug)) {
      alvos.push(row);
    } else {
      naoClassificadas.push(row);
    }
  }

  console.log(
    `${rows.length} bibliotecas: ${preservadas} ficam (legado + preservadas), ` +
      `${alvos.length} são resíduo de teste, ${naoClassificadas.length} sem classificação.`,
  );
  for (const row of naoClassificadas) {
    console.log(`  não classificada (fica): ${row.slug} · ${row.name}`);
  }

  if (!confirmed) {
    console.log("\nDry-run. Rode com CONFIRM=yes para apagar via API.");
    return;
  }

  let apagadas = 0;
  const falhas: { slug: string; motivo: string }[] = [];
  for (const alvo of alvos) {
    try {
      const response = await fetch(`${appUrl}/api/libraries/${alvo.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        // A rota confirma pelo nome de propósito (é o gesto da tela); aqui o nome vem do próprio
        // banco, então a confirmação vira o que ela deve ser num lote: prova de que o id e o nome
        // ainda apontam para a mesma biblioteca.
        body: JSON.stringify({ name: alvo.name }),
      });
      if (!response.ok) {
        const texto = await response.text();
        falhas.push({ slug: alvo.slug, motivo: `HTTP ${response.status}: ${texto.slice(0, 120)}` });
        continue;
      }
      apagadas++;
      if (apagadas % 100 === 0) console.log(`  ${apagadas}/${alvos.length}…`);
    } catch (error) {
      falhas.push({ slug: alvo.slug, motivo: error instanceof Error ? error.message : String(error) });
    }
  }

  console.log(`\nApagadas: ${apagadas} de ${alvos.length}.`);
  for (const falha of falhas) console.log(`  falhou: ${falha.slug} — ${falha.motivo}`);
  if (falhas.length > 0) process.exitCode = 1;
}

await main();
