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
 *
 * **O editor entrou na lista depois**, e a ausência dele era o buraco: as três telas de acervo são
 * as que o defeito original tocou, e a vigilância parou onde o defeito tinha estado. O editor é a
 * tela mais pesada do produto — Monaco, árvore com drag-and-drop, painel do agente —, é onde o
 * usuário passa o dia, e é onde uma árvore descartada custa o texto que ele acabou de escrever.
 * Vigiar só onde já deu errado é vigiar o passado.
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

    // As telas mostram “há N min”, e o defeito aparecia na virada de minuto entre o servidor e a
    // hidratação. O relógio do navegador **um minuto à frente** do servidor põe a virada em toda
    // execução: com o defeito de volta, “há 51 min” do servidor encontra “há 52 min” do cliente
    // sempre, e não só quando a espera fixa de 1,5 s calhava de cruzar o minuto.
    await page.clock.setFixedTime(Date.now() + 61_000);

    await page.goto(rota);

    // A hidratação terminou quando a tela responde a clique: é o estado observável, não um tempo.
    // O catálogo não tem botão que só o cliente abra; ali, a rede parada diz que os scripts da
    // página já rodaram.
    if (rota !== "/publicacoes") await provarInteratividade(page);
    else await page.waitForLoadState("networkidle");

    expect(vigia.erros, vigia.erros.join(" | ")).toEqual([]);
  });
}

test("o editor hidrata sem erro e responde a clique", async ({ page }) => {
  const marca = `${Date.now()}`;

  const biblioteca = await page.request.post("/api/libraries", {
    data: { name: `Acervo hidratação ${marca}` },
  });
  const { library } = (await biblioteca.json()) as { library: { id: string } };

  const livro = await page.request.post(`/api/libraries/${library.id}/publications`, {
    data: { title: `Livro hidratação ${marca}` },
  });
  const { publication } = (await livro.json()) as { publication: { id: string } };

  const capitulo = await page.request.post(`/api/publications/${publication.id}/nodes`, {
    data: { kind: "CHAPTER", title: "Capítulo", placement: { kind: "lastChild", parentId: null } },
  });
  const { id: capituloId } = (await capitulo.json()) as { id: string };

  await page.request.post(`/api/publications/${publication.id}/questions`, {
    data: { type: "MULTIPLE_CHOICE", placement: { kind: "lastChild", parentId: capituloId } },
  });

  /*
   * **Chegar navegando, e não pela URL direta.**
   *
   * Foi aqui que o defeito se escondeu. O `DndContext` do dnd-kit gerava ids de acessibilidade a
   * partir de um contador de módulo: no servidor ele nasce zerado a cada requisição; no cliente,
   * vive enquanto a aba viver. Abrir o editor direto pela URL casava os dois em zero e o teste
   * passava. Chegar por dentro do app, depois de outra tela ter montado um `DndContext`, hidratava
   * com um número diferente — e o React descartava a árvore inteira.
   *
   * Era o mesmo defeito da Home com "há 51 min" contra "há 52 min", com o mesmo sintoma: tela com
   * aparência de pronta e botões que são enfeite. E era igualmente intermitente, que é o jeito
   * mais caro de um bug se apresentar.
   */
  await page.goto("/");
  await page.getByRole("navigation", { name: "Módulos" }).getByRole("button", { name: "Publicações" }).click();
  await expect(page).toHaveURL(/\/publicacoes/);

  const vigia = vigiar(page);

  await page.goto(`/publications/${publication.id}/editor`);

  // Com a árvore montada: o drag-and-drop e o Monaco só entram depois, e é aí que uma divergência
  // entre servidor e cliente apareceria.
  await expect(page.getByRole("treeitem").first()).toBeVisible();
  await page.waitForTimeout(2_000);

  // A prova de que a árvore está viva, aqui, é a paleta: um atalho que só o cliente escuta.
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");

  expect(vigia.erros, vigia.erros.join(" | ")).toEqual([]);
});
