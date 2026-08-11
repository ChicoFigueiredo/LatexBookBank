import { expect, test, type Page } from "@playwright/test";

import { abrirQuestao } from "./acervo";

/**
 * **O que do checklist visual é medida, e não gosto** (§34 · issue #197).
 *
 * O §11 é do Chico: "nenhum painel parece CRUD de 2014" e "o editor domina o centro" são juízos que
 * ninguém verifica por asserção. Mas três linhas dele **não** são juízo — são número:
 *
 * - utilizável em 1366×768;
 * - excelente em 1920×1080;
 * - redimensionar não quebra o layout.
 *
 * Transbordo horizontal é fato: ou a página cabe na janela, ou aparece uma barra de rolagem que
 * ninguém pediu. E o próprio checklist já tinha feito a conta — "rail 216 + árvore 280 + editor
 * ≥ 420 com o aside fechado" — sem nunca conferi-la numa tela. Confere: 217 + 281 + 432.
 *
 * O que fica com o Chico continua com ele. O que dá para medir passa a falhar sozinho.
 */

const MINIMA = { width: 1366, height: 768 };
const CONFORTAVEL = { width: 1920, height: 1080 };


/** `true` quando a janela ganhou uma barra de rolagem horizontal que ninguém pediu. */
const transborda = (page: Page) =>
  page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );

test.describe("o layout cabe na janela", () => {
  test("em 1366×768, a resolução mínima declarada", async ({ page }) => {
    await page.setViewportSize(MINIMA);
    await abrirQuestao(page);

    expect(await transborda(page)).toBe(false);

    // A conta do checklist, conferida: com o aside fechado o editor tem pelo menos 420 px — o
    // bastante para uma linha de LaTeX caber sem quebrar no meio de um comando.
    const editor = await page.getByRole("group", { name: /Editor LaTeX/ }).boundingBox();
    expect(editor?.width ?? 0).toBeGreaterThanOrEqual(420);
  });

  test("em 1920×1080", async ({ page }) => {
    await page.setViewportSize(CONFORTAVEL);
    await abrirQuestao(page);

    expect(await transborda(page)).toBe(false);
  });

  test("**redimensionar** não quebra — e é diferente de abrir já pequeno", async ({ page }) => {
    // O caso que só o redimensionamento pega: larguras guardadas em `localStorage` são pixels, e
    // uma divisória arrastada num monitor grande pode não caber no pequeno. Abrir direto em 1366
    // não exercita isso; encolher a janela, sim.
    await page.setViewportSize(CONFORTAVEL);
    await abrirQuestao(page);

    await page.setViewportSize(MINIMA);
    await page.waitForTimeout(600);

    expect(await transborda(page)).toBe(false);
  });

  test("com o painel do agente aberto, ainda cabe em 1366", async ({ page }) => {
    // É o caso apertado de verdade: rail + árvore + editor + preview + agente na largura mínima.
    // Medido, o editor cai para ~240 px — estreito, e **ajustável**: as divisórias existem e as
    // larguras persistem. Este teste afirma o que é objetivo (cabe), não o que é confortável.
    await page.setViewportSize(MINIMA);
    await abrirQuestao(page);

    await page.keyboard.press("Control+Shift+A");
    await page.waitForTimeout(800);

    expect(await transborda(page)).toBe(false);
    // E o editor continua na tela: encolher até sumir seria quebrar, não apertar.
    const editor = await page.getByRole("group", { name: /Editor LaTeX/ }).boundingBox();
    expect(editor?.width ?? 0).toBeGreaterThan(150);
  });
});
