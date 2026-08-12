import { expect, test, type Page } from "@playwright/test";

/**
 * O overview do livro — a parada entre escolher e editar (protótipo, 492–599).
 *
 * Até esta rodada `/publications/[id]` abria o workbench direto, e o rail do protótipo listava
 * `Publicações` **e** `Editor do livro` para dois lugares que no app eram um só.
 *
 * O que este teste garante não é aparência: é que a parada existe (o resumo não abre a árvore),
 * que ela **leva** ao editor, e que o caminho de volta funciona. Uma tela intermediária que não
 * vai nem volta seria pior que o salto que ela substituiu.
 */

async function primeiroLivro(page: Page) {
  const resposta = await page.request.get("/api/publications?limit=1");
  if (resposta.ok()) {
    const payload = (await resposta.json()) as { publications?: { id: string; title: string }[] };
    const encontrado = payload.publications?.[0];
    if (encontrado) return encontrado;
  }

  // Sem endpoint de listagem, o caminho é o do usuário: a estante da primeira biblioteca.
  const libs = await page.request.get("/api/libraries");
  const { libraries } = (await libs.json()) as { libraries: { slug: string }[] };

  for (const library of libraries) {
    await page.goto(`/bibliotecas/${library.slug}`);
    const link = page.locator('a[href^="/publications/"]').first();
    if ((await link.count()) === 0) continue;

    const href = await link.getAttribute("href");
    const id = href?.split("/")[2];
    if (id) return { id, title: (await link.innerText()).split("\n")[0] ?? "" };
  }

  return null;
}

test("o resumo do livro é a parada antes do editor, e leva a ele", async ({ page }) => {
  const livro = await primeiroLivro(page);
  test.skip(livro === null, "nenhum livro no banco");
  if (!livro) return;

  await page.goto(`/publications/${livro.id}`);

  // A tela é o resumo, não a árvore: o workbench tem `treeitem`, o resumo não.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("treeitem")).toHaveCount(0);

  // Os quatro blocos do protótipo que carregam decisão. "Precisa da sua atenção" só aparece
  // quando há pendência, então não entra na lista do que é obrigatório.
  await expect(page.getByRole("heading", { name: "Estrutura" })).toBeVisible();
  // Pelo `.lbb-source`, e não pelo texto: "Sem fonte editorial anexada" é uma das pendências, e
  // procurar a frase solta casa com a pendência e com o título do bloco ao mesmo tempo.
  await expect(page.locator(".lbb-source")).toBeVisible();

  await page.getByRole("link", { name: "Abrir no editor" }).first().click();

  await expect(page).toHaveURL(new RegExp(`/publications/${livro.id}/editor`));
  // Pela árvore, e não por um `treeitem`: livro recém-criado tem a árvore vazia, e o que prova
  // que se chegou ao workbench é a zona existir — não ter conteúdo dentro.
  await expect(page.getByText("Árvore", { exact: true })).toBeVisible();

  // E o caminho de volta: o breadcrumb do editor devolve ao resumo. Sem isso a parada vira via
  // de mão única, e quem entrou no editor perde o único lugar que responde "o que falta aqui".
  const volta = page.locator(`a[href="/publications/${livro.id}"]`);
  await expect(volta, "o editor precisa ter um caminho de volta ao resumo").toHaveCount(1);
  await volta.click();
  await expect(page).toHaveURL(new RegExp(`/publications/${livro.id}$`));
});

test("as pendências do livro levam onde se resolve", async ({ page }) => {
  const livro = await primeiroLivro(page);
  test.skip(livro === null, "nenhum livro no banco");
  if (!livro) return;

  await page.goto(`/publications/${livro.id}`);

  const atencao = page.getByRole("region", { name: "Precisa da sua atenção" });
  test.skip((await atencao.count()) === 0, "o livro de teste não tem pendência");

  // Toda linha da faixa warn é um link — pendência que não leva a lugar nenhum é só um aviso.
  const linhas = atencao.getByRole("link");
  await expect(linhas.first()).toBeVisible();

  for (const link of await linhas.all()) {
    const href = await link.getAttribute("href");
    expect(href, "pendência sem destino").toMatch(/^\/publications\//);
  }
});
