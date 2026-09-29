import { defineConfig, devices } from "@playwright/test";

/**
 * A porta do servidor do E2E — e **não** a `28080` do dia a dia, que aponta para o acervo (#241).
 * Mesmo bloco `28xxx` do README, abaixo da faixa efêmera do kernel.
 */
const PORT = 28081;
const BASE_URL = `http://127.0.0.1:${PORT}`;

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
  // Confere, antes do primeiro teste, que o servidor é o do E2E e não o do acervo.
  globalSetup: "./e2e/global-setup.ts",

  use: {
    baseURL: BASE_URL,
    // Só do que falhou: trace de tudo enche o disco por um problema que quase nunca acontece.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    // `dev` e não `start`: um build de produção esconderia justamente os erros de hidratação que
    // este teste existe para pegar. Mas é um `dev` **próprio**, com banco e storage que nascem a
    // cada execução (`e2e/server.ts`): o E2E esvazia lixeira e edita questão, e antes fazia isso
    // no acervo, porque reaproveitava o servidor que a pessoa usa.
    command: `bun e2e/server.ts ${PORT}`,
    url: `${BASE_URL}/api/infra`,
    // Nunca reaproveita: um servidor que já está na porta não é, por definição, o que este
    // comando acabou de semear.
    reuseExistingServer: false,
    // Migrações, seed e a primeira compilação do `next dev`.
    timeout: 240_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
