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

/**
 * O livro deste teste é **criado por ele**, e não achado no banco.
 *
 * A primeira versão pegava "o primeiro livro que existir". Passou por meses e quebrou no dia em
 * que o estado vazio do resumo entrou (§11): o primeiro livro do banco passou a ser um dos vazios
 * que outro teste tinha acabado de criar, e a asserção sobre "Estrutura" media a tela errada.
 *
 * Teste que depende do estado ambiente do banco falha **de vez em quando** e por motivo alheio ao
 * que ele afirma — é o formato de flakiness que este projeto já pagou caro em outras três frentes.
 * Criar o próprio livro custa três requisições e remove a categoria inteira de problema.
 */
async function livroComEstrutura(page: Page) {
  const marca = `${Date.now()}`;

  const biblioteca = await page.request.post("/api/libraries", {
    data: { name: `Acervo resumo ${marca}` },
  });
  expect(biblioteca.ok(), "não deu para criar a biblioteca").toBeTruthy();
  const { library } = (await biblioteca.json()) as { library: { id: string } };

  const livro = await page.request.post(`/api/libraries/${library.id}/publications`, {
    data: { title: `Livro do resumo ${marca}` },
  });
  expect(livro.ok(), "não deu para criar o livro").toBeTruthy();
  const { publication } = (await livro.json()) as { publication: { id: string; title: string } };

  /*
   * Com capítulo: é o que faz o resumo ser o estado **cheio**, que é o que este teste mede.
   *
   * E a resposta é conferida. Sem isto, um POST que falha sob carga deixa o livro vazio, a tela
   * renderiza o estado `LIVRO · vazio` — que não tem faixa de pendências — e o teste falha lá na
   * frente por um motivo que não tem nada a ver com o que ele afirma. Fixture que se monta pela
   * metade em silêncio é uma das fontes de falha intermitente deste projeto.
   */
  const capitulo = await page.request.post(`/api/publications/${publication.id}/nodes`, {
    data: { kind: "CHAPTER", title: "Capítulo 1", placement: { kind: "lastChild", parentId: null } },
  });
  expect(capitulo.ok(), "o capítulo é o que torna o resumo o estado cheio").toBeTruthy();

  return publication;
}

test("o resumo do livro é a parada antes do editor, e leva a ele", async ({ page }) => {
  const livro = await livroComEstrutura(page);

  await page.goto(`/publications/${livro.id}`);

  // A tela é o resumo, não a árvore: o workbench tem `treeitem`, o resumo não.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("treeitem")).toHaveCount(0);

  // Os quatro blocos do protótipo que carregam decisão. "Precisa da sua atenção" só aparece
  // quando há pendência, então não entra na lista do que é obrigatório.
  await expect(page.getByRole("heading", { name: "Estrutura" })).toBeVisible();
  // Pelo `.lbb-source`, e não pelo texto: "Sem PDF fonte anexado" é uma das pendências, e
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
  const livro = await livroComEstrutura(page);

  await page.goto(`/publications/${livro.id}`);

  // Sem `skip`: o livro deste teste tem capítulo e nenhuma questão, então a pendência "o livro
  // ainda não tem questão nenhuma" é **garantida**. Um `skip` condicional aqui seria um teste que
  // se cala justamente quando o cenário que ele mede não aconteceu.
  const atencao = page.getByRole("region", { name: "Precisa da sua atenção" });

  // Toda linha da faixa warn é um link — pendência que não leva a lugar nenhum é só um aviso.
  const linhas = atencao.getByRole("link");
  await expect(linhas.first()).toBeVisible();

  for (const link of await linhas.all()) {
    const href = await link.getAttribute("href");
    expect(href, "pendência sem destino").toMatch(/^\/publications\//);
  }
});
