import { expect, test, type Page } from "@playwright/test";

import { abrirQuestao } from "./acervo";

/**
 * **Os atalhos não brigam com o Monaco** (§34, aberto desde a Fase 2).
 *
 * O item pedia verificação, não implementação — e verificar é o que faltava. A árvore registra os
 * atalhos dela no `onKeyDown` de **cada linha**, então eles só existem quando uma linha tem foco;
 * o workbench registra dois em `window`, e é aí que o conflito é possível.
 *
 * Este arquivo mede o que de fato acontece com o editor focado. O que ele afirma é o critério da
 * §42: **a experiência de teclado nunca é sacrificada** — nem a do editor, nem a da árvore.
 *
 * Ver spec §34 · §42 · issue #179.
 */


const focarEditor = async (page: Page) => {
  await page
    .getByRole("group", { name: /Editor LaTeX/ })
    .locator(".monaco-editor .view-lines")
    .click();
};

test.describe("atalhos com o editor focado", () => {
  test("os atalhos da árvore **não** disparam — eles vivem na linha, não na janela", async ({
    page,
  }) => {
    // É a afirmação central: `Ctrl+N` (novo irmão), `Ctrl+D` (duplicar) e `Alt+↓` (mover nó) são
    // gestos da árvore. Se fossem escutas de janela, digitar no editor mexeria no acervo — e o
    // sintoma seria um capítulo novo aparecendo enquanto alguém escreve uma questão.
    await abrirQuestao(page);

    const antes = await page.getByRole("treeitem").count();
    await focarEditor(page);

    await page.keyboard.press("Control+n");
    await page.keyboard.press("Control+Shift+n");
    await page.keyboard.press("Control+d");
    await page.keyboard.press("Alt+ArrowDown");
    await page.keyboard.press("Alt+ArrowUp");

    // Nada foi criado, duplicado nem movido.
    await expect(page.getByRole("treeitem")).toHaveCount(antes);
  });

  test("`Delete` no editor apaga caractere, não a questão", async ({ page }) => {
    // `Del` exclui o nó quando a árvore tem foco. Com o editor focado ele precisa ser só uma
    // tecla de texto — e o teste desfaz o que digitou.
    await abrirQuestao(page);

    const antes = await page.getByRole("treeitem").count();
    await focarEditor(page);
    await page.keyboard.press("Control+End");
    await page.keyboard.type("XY");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");

    await expect(page.getByRole("treeitem")).toHaveCount(antes);
    // E nenhum diálogo de exclusão apareceu.
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("`Ctrl+S` salva sem levar o diálogo do navegador junto", async ({ page }) => {
    await abrirQuestao(page);
    await focarEditor(page);
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" z");

    await expect(page.getByText("não salvo", { exact: true })).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press("Control+s");
    await expect(page.getByText("salvo", { exact: true })).toBeVisible({ timeout: 15_000 });

    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await expect(page.getByText("salvo", { exact: true })).toBeVisible({ timeout: 15_000 });
  });

  test("`Ctrl+K` abre a paleta **também com o editor focado**", async ({ page }) => {
    // Foi o único conflito real que a medição achou, e ao contrário do que eu supunha: o Monaco
    // usa `Ctrl+K` como prefixo de acorde e o **consumia**, então a paleta não abria — enquanto o
    // botão do rail anuncia "Buscar · Ctrl K".
    //
    // Um atalho anunciado na tela que falha em silêncio conforme o foco é pior que os dois lados:
    // quem aperta conclui que o produto travou. O editor passou a devolver a tecla (#179).
    await abrirQuestao(page);
    await focarEditor(page);

    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("e continua abrindo com a **árvore** focada — o controle da afirmação acima", async ({
    page,
  }) => {
    // Sem este, o teste anterior passaria mesmo que a paleta tivesse virado um botão só de mouse.
    await abrirQuestao(page);
    await page.getByRole("tree").getByRole("button").first().click();

    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press("Escape");
  });
});
