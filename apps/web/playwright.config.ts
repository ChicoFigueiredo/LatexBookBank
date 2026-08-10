import { defineConfig, devices } from "@playwright/test";

/**
 * O E2E da §27.
 *
 * Tudo até aqui foi verificado por rota e por unidade, e nada disso pega o que só quebra quando
 * alguém clica em sequência: hidratação, foco que se perde, autosave que não dispara porque o
 * `keydown` foi no elemento errado. É esse buraco que estes testes cobrem, e por isso são poucos
 * e caros — não uma segunda suíte cobrindo o que a primeira já cobre.
 *
 * `e2e/` fora de `tests/`: o Vitest varre `tests/**` e tentaria rodar isto como teste de unidade.
 *
 * Ver spec §27 · issue #155.
 */
export default defineConfig({
  testDir: "./e2e",
  // O caminho da §27 é **um** fluxo com passos que dependem do anterior. Rodar em paralelo daria
  // duas sessões editando a mesma questão e um conflito de concorrência que o produto está certo
  // em recusar.
  workers: 1,
  fullyParallel: false,
  // Nada de `retries`: um teste que passa na segunda tentativa é um teste que não diz nada. Se
  // ele é instável, o instável é o produto ou o teste, e os dois precisam aparecer.
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env["CI"] === undefined ? "list" : [["list"], ["github"]],

  use: {
    baseURL: "http://localhost:28080",
    // Só do que falhou: trace de tudo enche o disco por um problema que quase nunca acontece.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    // `dev` e não `start`: o E2E roda contra o mesmo servidor que a pessoa usa, e um build de
    // produção esconderia justamente os erros de hidratação que este teste existe para pegar.
    command: "bun run dev",
    url: "http://localhost:28080",
    // Reaproveita o servidor que já estiver de pé — em desenvolvimento ele quase sempre está, e
    // subir um segundo daria conflito de porta em vez de teste.
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
