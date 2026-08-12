import { expect, test, type Page } from "@playwright/test";

/**
 * As telas de acervo hidratam sem divergir do que o servidor mandou.
 *
 * O guarda que faltava. A Home formatava o tempo relativo com `new Date()` **dentro** de um Client
 * Component — que também roda no servidor. Nas viradas de minuto o servidor escrevia “há 51 min” e
 * a hidratação escrevia “há 52 min”; o React descartava a árvore inteira e a página parava de
 * reagir a clique. Nada quebrava visualmente, e é o que tornava o defeito ruim: a tela parecia
 * pronta e os botões eram enfeite.
 *
 * Vinte e três testes de E2E passavam por cima dele porque nenhum olhava o console — e os que
 * clicavam falhavam **de vez em quando**, que é o jeito mais caro de um bug se apresentar.
 *
 * Um erro de hidratação chega ao Playwright por dois canais distintos, e os dois são checados:
 * `pageerror` (exceção não tratada) e `console` com o texto do aviso do React.
 */

interface Vigia {
  readonly erros: string[];
}

function vigiar(page: Page): Vigia {
  const erros: string[] = [];

  page.on("pageerror", (error) => erros.push(`pageerror: ${String(error)}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;

    const texto = message.text();
    if (/hydrat|hidrat|did not match|server (?:rendered )?HTML/i.test(texto)) {
      erros.push(`console: ${texto}`);
    }
  });

  return { erros };
}

/** Prova que a árvore está viva: um botão que só o cliente sabe abrir. */
async function provarInteratividade(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Criar biblioteca" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
}

for (const [nome, rota] of [
  ["a Home", "/"],
  ["a lista de bibliotecas", "/bibliotecas"],
  ["o catálogo de publicações", "/publicacoes"],
] as const) {
  test(`${nome} hidrata sem erro e responde a clique`, async ({ page }) => {
    const vigia = vigiar(page);

    await page.goto(rota);
    // As telas mostram “há N min”. Esperar a virada é o que reproduz o defeito de propósito — sem
    // isto o teste só passa por sorte, que é exatamente como ele passava antes.
    await page.waitForTimeout(1_500);

    if (rota !== "/publicacoes") await provarInteratividade(page);

    expect(vigia.erros, vigia.erros.join(" | ")).toEqual([]);
  });
}
