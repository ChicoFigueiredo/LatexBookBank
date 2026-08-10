/**
 * Mede `LIKE` contra FTS5, para a decisão da Fase 12 ser tomada com número.
 *
 * Roda num banco **descartável**, nunca no do app: o corpus é sintético e não tem por que
 * encostar no acervo de ninguém. O acervo real também não está nesta máquina — e para a pergunta
 * "qual motor" a **escala** importa mais que a procedência: o que se quer saber é onde `LIKE`
 * deixa de servir, e isso depende do número de linhas, não de quais são elas.
 *
 * `bun scripts/benchmark-search.ts [linhas]`
 */

import { Database } from "bun:sqlite";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROWS = Number(process.argv[2] ?? 20_000);
const DB_PATH = join(tmpdir(), `lbb-search-benchmark-${ROWS}.db`);

/** Vocabulário do acervo: assuntos, bancas e verbos de enunciado, para o texto ser plausível. */
const SUBJECTS = [
  "juros simples",
  "juros compostos",
  "matrizes",
  "determinantes",
  "progressão aritmética",
  "progressão geométrica",
  "trigonometria",
  "logaritmos",
  "probabilidade",
  "análise combinatória",
  "geometria analítica",
  "funções quadráticas",
];

const BOARDS = ["CESPE / CEBRASPE", "FGV", "VUNESP", "Cesgranrio", "FCC", "IBFC"];

const VERBS = [
  "Calcule o valor de",
  "Determine a razão entre",
  "Qual é o montante de",
  "Assinale a alternativa que apresenta",
  "Considere a expressão e obtenha",
];

const FILLER =
  "Um capital de \\SI{1000}{\\real} é aplicado a uma taxa mensal, e o problema pede o valor " +
  "acumulado ao final do período indicado, desprezando arredondamentos intermediários.";

function seed(db: Database): void {
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`
    CREATE TABLE questions (
      id TEXT PRIMARY KEY,
      nickname TEXT,
      statementLatex TEXT NOT NULL,
      board TEXT,
      year INTEGER,
      difficulty INTEGER NOT NULL
    )
  `);

  const insert = db.prepare(
    "INSERT INTO questions (id, nickname, statementLatex, board, year, difficulty) VALUES (?, ?, ?, ?, ?, ?)",
  );

  const insertMany = db.transaction((count: number) => {
    for (let i = 0; i < count; i += 1) {
      const subject = SUBJECTS[i % SUBJECTS.length] as string;
      const verb = VERBS[i % VERBS.length] as string;

      insert.run(
        `q-${i}`,
        `${subject} — ${i}`,
        `${verb} ${subject}. ${FILLER} Questão número ${i}.`,
        BOARDS[i % BOARDS.length] as string,
        2000 + (i % 26),
        [0, 2, 5, 7, 10][i % 5] as number,
      );
    }
  });

  insertMany(ROWS);
}

function buildFts(db: Database): number {
  const started = performance.now();

  db.exec(`
    CREATE VIRTUAL TABLE questions_fts USING fts5(
      nickname, statementLatex, content='questions', content_rowid='rowid'
    )
  `);
  db.exec(
    "INSERT INTO questions_fts(rowid, nickname, statementLatex) " +
      "SELECT rowid, nickname, statementLatex FROM questions",
  );

  return performance.now() - started;
}

/** Mediana de N execuções: a média esconde o primeiro acesso, que paga o cache frio do SQLite. */
function measure(runs: number, run: () => number): { medianMs: number; rows: number } {
  const times: number[] = [];
  let rows = 0;

  for (let i = 0; i < runs; i += 1) {
    const started = performance.now();
    rows = run();
    times.push(performance.now() - started);
  }

  times.sort((a, b) => a - b);
  return { medianMs: times[Math.floor(times.length / 2)] as number, rows };
}

function main(): void {
  rmSync(DB_PATH, { force: true });
  rmSync(`${DB_PATH}-wal`, { force: true });
  rmSync(`${DB_PATH}-shm`, { force: true });

  const db = new Database(DB_PATH, { create: true });

  console.log(`Corpus sintético: ${ROWS.toLocaleString("pt-BR")} questões · ${DB_PATH}`);

  const seedStarted = performance.now();
  seed(db);
  console.log(`  seed: ${Math.round(performance.now() - seedStarted)} ms`);

  const ftsMs = buildFts(db);
  console.log(`  índice FTS5: ${Math.round(ftsMs)} ms\n`);

  const like = db.prepare(
    "SELECT id FROM questions WHERE nickname LIKE ?1 OR statementLatex LIKE ?1 LIMIT 50",
  );
  const likeCount = db.prepare(
    "SELECT COUNT(*) AS n FROM questions WHERE nickname LIKE ?1 OR statementLatex LIKE ?1",
  );
  const fts = db.prepare("SELECT rowid FROM questions_fts WHERE questions_fts MATCH ?1 LIMIT 50");
  const ftsCount = db.prepare(
    "SELECT COUNT(*) AS n FROM questions_fts WHERE questions_fts MATCH ?1",
  );

  const cases: ReadonlyArray<readonly [string, string, string]> = [
    ["termo raro", "%combinatória%", "combinatória"],
    ["termo comum", "%capital%", "capital"],
    ["duas palavras", "%juros compostos%", '"juros compostos"'],
    ["prefixo", "%trigono%", "trigono*"],
  ];

  console.log("caso            | LIKE (50)  | FTS5 (50)  | LIKE count | FTS5 count | linhas");
  console.log("----------------|------------|------------|------------|------------|-------");

  for (const [label, likePattern, ftsPattern] of cases) {
    const likeTop = measure(7, () => like.all(likePattern).length);
    const ftsTop = measure(7, () => fts.all(ftsPattern).length);
    const likeAll = measure(5, () => (likeCount.get(likePattern) as { n: number }).n);
    const ftsAll = measure(5, () => (ftsCount.get(ftsPattern) as { n: number }).n);

    console.log(
      `${label.padEnd(15)} | ${fmt(likeTop.medianMs)} | ${fmt(ftsTop.medianMs)} | ` +
        `${fmt(likeAll.medianMs)} | ${fmt(ftsAll.medianMs)} | ${String(likeAll.rows).padStart(6)}`,
    );
  }

  db.close();
  rmSync(DB_PATH, { force: true });
  rmSync(`${DB_PATH}-wal`, { force: true });
  rmSync(`${DB_PATH}-shm`, { force: true });
  console.log("\nBanco descartável removido.");
}

const fmt = (ms: number): string => `${ms.toFixed(2).padStart(7)} ms`;

main();
