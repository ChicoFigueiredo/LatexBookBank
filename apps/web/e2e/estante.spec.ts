import { expect, test } from "@playwright/test";

/**
 * A estante de uma biblioteca — tabela, não cards (protótipo, 457–482).
 *
 * O que este teste garante não é a aparência: é que as colunas que sustentam a **comparação**
 * estão lá (questões, estado, última edição) e que o filtro estreita a lista sem recarregar a
 * página. Card não alinha número, e foi por isso que a grade saiu.
 */
test("a estante compara livros por coluna, e o filtro estreita", async ({ page }) => {
  const resposta = await page.request.get("/api/libraries");
  const { libraries } = (await resposta.json()) as { libraries: { slug: string; name: string }[] };

  const comLivros = libraries.find((l) => l.name.includes("Teste")) ?? libraries[0];
  expect(comLivros, "nenhuma biblioteca no banco").toBeTruthy();

  await page.goto(`/bibliotecas/${comLivros?.slug}`);

  const tabela = page.getByRole("table");
  await expect(tabela).toBeVisible();

  for (const coluna of ["Título", "Questões", "Estado", "Última edição"]) {
    await expect(page.getByRole("columnheader", { name: coluna })).toBeVisible();
  }

  const linhas = tabela.getByRole("row");
  const antes = await linhas.count();
  expect(antes, "a biblioteca de teste precisa ter ao menos um livro").toBeGreaterThan(1);

  // Um termo que nenhum título casa: a lista vazia precisa explicar o que o filtro olha, e
  // oferecer a saída — lista vazia sem saída é beco.
  await page.getByLabel("Filtrar os livros").fill("zzzz-nao-existe");
  await expect(page.getByText("O filtro olha título, apelido, subtítulo, autor e edição.")).toBeVisible();

  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await expect(tabela.getByRole("row")).toHaveCount(antes);
});

/**
 * **O recorte da estante** — `Todos · Com pendências · Sem estrutura` (protótipo, 457–482).
 *
 * A busca por texto responde “onde está o livro X”. O recorte responde a outra pergunta, e é a
 * razão de a estante existir: **quais precisam de mim**. A pílula de estado responde isso por
 * linha; varrer 24 linhas para montar a lista mentalmente é o trabalho que o recorte faz de uma
 * vez.
 *
 * Correção de percurso registrada: a §3 foi marcada como resolvida com a tabela, a busca e a
 * contagem — e o protótipo pedia “filtros segmentados” na mesma frase. Estava resolvida pela
 * metade.
 */
test("o recorte separa quem precisa de atenção de quem está pronto", async ({ page }) => {
  const marca = `${Date.now()}`;

  const biblioteca = await page.request.post("/api/libraries", {
    data: { name: `Acervo recorte ${marca}` },
  });
  expect(biblioteca.ok()).toBeTruthy();
  const { library } = (await biblioteca.json()) as { library: { id: string; slug: string } };

  // Um livro vazio (sem estrutura) e um com questão (pronto): os dois recortes que o protótipo
  // nomeia precisam de um livro cada para existirem.
  const vazio = await page.request.post(`/api/libraries/${library.id}/publications`, {
    data: { title: `Livro vazio ${marca}` },
  });
  expect(vazio.ok()).toBeTruthy();

  const cheio = await page.request.post(`/api/libraries/${library.id}/publications`, {
    data: { title: `Livro cheio ${marca}` },
  });
  const { publication } = (await cheio.json()) as { publication: { id: string } };

  const capitulo = await page.request.post(`/api/publications/${publication.id}/nodes`, {
    data: { kind: "CHAPTER", title: "Capítulo", placement: { kind: "lastChild", parentId: null } },
  });
  expect(capitulo.ok()).toBeTruthy();
  const { id: capituloId } = (await capitulo.json()) as { id: string };

  const questao = await page.request.post(`/api/publications/${publication.id}/questions`, {
    data: { type: "MULTIPLE_CHOICE", placement: { kind: "lastChild", parentId: capituloId } },
  });
  expect(questao.ok()).toBeTruthy();

  await page.goto(`/bibliotecas/${library.slug}`);

  const linhas = page.locator(".lbb-shelf-row:not(.lbb-shelf-head)");
  await expect(linhas).toHaveCount(2);

  await test.step("“Sem estrutura” deixa só o livro vazio", async () => {
    await page.getByRole("button", { name: "Sem estrutura", exact: true }).click();

    await expect(linhas).toHaveCount(1);
    await expect(linhas.first()).toContainText(`Livro vazio ${marca}`);
  });

  await test.step("e o recorte se compõe com a busca, em vez de brigar com ela", async () => {
    // Um termo que só casa com o livro **cheio**, dentro do recorte dos vazios: some tudo, e a
    // tela precisa dizer que foram os dois filtros juntos.
    await page.getByLabel("Filtrar os livros").fill("cheio");

    await expect(linhas).toHaveCount(0);
    await expect(page.getByText("Nenhum livro do recorte casa com a busca")).toBeVisible();

    await page.getByRole("button", { name: "Limpar filtros" }).click();
    await expect(linhas).toHaveCount(2);
  });
});

/**
 * **Excluir um livro** — o menu `⋯` do protótipo termina em `Excluir`, e não havia como.
 *
 * Dava para apagar a **biblioteca** inteira, com confirmação por nome digitado, e dava para mandar
 * nó e questão para a lixeira. Um livro importado por engano — a entrada errada do Calibre, a
 * duplicata que só aparece depois — ficava no acervo para sempre, e a única saída era apagar a
 * biblioteca em volta dele.
 *
 * Segue a cerimônia da biblioteca, e não a da lixeira: a lixeira é de `DocumentNode`, e fingir uma
 * lixeira de livros exigiria coluna nova. Dois gestos igualmente definitivos com cerimônias
 * diferentes ensinariam que a cerimônia é decorativa.
 */
test("excluir um livro exige o título digitado, e diz o que vai junto", async ({ page }) => {
  const marca = `${Date.now()}`;
  const titulo = `Livro a excluir ${marca}`;

  const biblioteca = await page.request.post("/api/libraries", {
    data: { name: `Acervo excluir livro ${marca}` },
  });
  expect(biblioteca.ok()).toBeTruthy();
  const { library } = (await biblioteca.json()) as { library: { id: string; slug: string } };

  const livro = await page.request.post(`/api/libraries/${library.id}/publications`, {
    data: { title: titulo },
  });
  expect(livro.ok()).toBeTruthy();
  const { publication } = (await livro.json()) as { publication: { id: string } };

  const capitulo = await page.request.post(`/api/publications/${publication.id}/nodes`, {
    data: { kind: "CHAPTER", title: "Capítulo", placement: { kind: "lastChild", parentId: null } },
  });
  expect(capitulo.ok()).toBeTruthy();
  const { id: capituloId } = (await capitulo.json()) as { id: string };

  for (let i = 0; i < 2; i += 1) {
    const questao = await page.request.post(`/api/publications/${publication.id}/questions`, {
      data: { type: "MULTIPLE_CHOICE", placement: { kind: "lastChild", parentId: capituloId } },
    });
    expect(questao.ok()).toBeTruthy();
  }

  await page.goto(`/bibliotecas/${library.slug}`);

  const linha = page.locator(".lbb-shelf-row:not(.lbb-shelf-head)").filter({ hasText: titulo });
  await expect(linha).toHaveCount(1);

  await linha.getByRole("button", { name: /Ações do livro/ }).click();
  await page.getByRole("menuitem", { name: "Excluir livro" }).click();

  const dialogo = page.getByRole("dialog");
  await expect(dialogo).toContainText("Não há como desfazer");

  await test.step("o aviso conta o que existe dentro, buscado do servidor", async () => {
    await expect(dialogo).toContainText("2 questões", { timeout: 15_000 });
    // E diz o que a lixeira **não** cobre, que é o que torna o gesto diferente de excluir um nó.
    await expect(dialogo).toContainText("a lixeira não alcança livro");
  });

  await test.step("e a **rota** recusa, não só o botão", async () => {
    /*
     * A trava da tela não é a trava do produto.
     *
     * Desligando a confirmação no domínio, este teste continuava passando: ele exercita o botão, e
     * o botão já estava desabilitado. Quem manda um `DELETE` por script passa por baixo da tela —
     * e é por isso que a confirmação é regra de domínio, e não validação de formulário.
     */
    const semTitulo = await page.request.delete(`/api/publications/${publication.id}`, {
      data: { title: "titulo errado" },
    });

    expect(semTitulo.status()).toBe(400);
    expect(await semTitulo.text()).toContain("confirmation_mismatch");

    // E não apagou: recusar não é só devolver erro, é não ter tocado em nada.
    const aindaExiste = await page.request.get(`/api/publications/${publication.id}/tree`);
    expect(aindaExiste.ok()).toBeTruthy();
  });

  await test.step("o botão só liga com o título exato", async () => {
    const excluir = dialogo.getByRole("button", { name: "Excluir livro" });
    await expect(excluir).toBeDisabled();

    // Quase certo é o sinal de quem não leu direito — que é exatamente quem a confirmação para.
    await dialogo.getByRole("textbox").fill(titulo.toLowerCase());
    await expect(excluir).toBeDisabled();

    await dialogo.getByRole("textbox").fill(titulo);
    await expect(excluir).toBeEnabled();
    await excluir.click();
  });

  await test.step("e o livro sai da estante e do banco", async () => {
    await expect(linha).toHaveCount(0, { timeout: 20_000 });

    const arvore = await page.request.get(`/api/publications/${publication.id}/tree`);
    expect(arvore.status()).toBe(404);
  });
});
