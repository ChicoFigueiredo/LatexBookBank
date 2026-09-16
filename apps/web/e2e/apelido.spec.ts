import { expect, test } from "@playwright/test";

/**
 * O apelido do livro — o campo que existia inteiro e nunca aparecia.
 *
 * `Publication.nickname` está no schema, é normalizado por `parsePublicationDraft`, é validado com
 * teto de 120 caracteres e atravessa o exportador `.lbb`. E **nenhuma tela do produto o escrevia
 * ou o mostrava**: o app guardava com cuidado um dado que o usuário não tinha como fornecer nem
 * como ler. É a §49 outra vez — endpoint pronto, jornada inexistente.
 *
 * O protótipo (2312–2322) o põe ao lado do título, com `FME 3` de exemplo, e é assim que um
 * professor chama o livro. Este teste percorre o caminho inteiro — cadastrar, achar pelo apelido
 * na estante, ver no resumo — porque o defeito não era de nenhuma tela em particular: era de
 * nenhuma delas ter fechado o circuito.
 */

const APELIDO = "FME 3";

test("o apelido vai do cadastro à estante e ao resumo, e o filtro acha por ele", async ({ page }) => {
  const marca = `${Date.now()}`;

  const biblioteca = await page.request.post("/api/libraries", {
    data: { name: `Acervo apelido ${marca}` },
  });
  const { library } = (await biblioteca.json()) as { library: { slug: string } };

  await test.step("cadastrar com apelido", async () => {
    await page.goto(`/bibliotecas/${library.slug}/livros/novo`);

    await page.getByLabel("Título").fill(`Fundamentos de Matemática Elementar ${marca}`);
    await page.getByLabel("Apelido").fill(APELIDO);
    await page.getByRole("button", { name: "Cadastrar livro" }).click();

    await expect(page.getByText("Livro criado")).toBeVisible();
  });

  await test.step("a estante mostra o apelido ao lado do título", async () => {
    await page.goto(`/bibliotecas/${library.slug}`);

    // `:not(.lbb-shelf-head)` porque o cabeçalho da tabela carrega a mesma classe da linha, para
    // as colunas alinharem — sem isso, `.first()` é o cabeçalho e a asserção mede a coisa errada.
    const linha = page.locator(".lbb-shelf-row:not(.lbb-shelf-head)").first();
    await expect(linha.locator(".lbb-shelf-nick")).toHaveText(APELIDO);
  });

  await test.step("o filtro acha pelo apelido, que é como o livro é procurado", async () => {
    // O título tem carimbo e o apelido não: filtrar por "FME" só casa se o apelido entrar na
    // busca. Antes disto o campo era invisível para o filtro tanto quanto para o olho.
    await page.getByLabel("Filtrar os livros").fill("FME");
    await expect(page.locator(".lbb-shelf-row:not(.lbb-shelf-head)")).toHaveCount(1);

    await page.getByLabel("Filtrar os livros").fill("zzzz-nao-existe");
    await expect(page.getByText("O filtro olha título, apelido, subtítulo, autor e edição.")).toBeVisible();
  });

  await test.step("o resumo do livro mostra o apelido junto do título", async () => {
    await page.getByRole("button", { name: "Limpar filtros" }).click();
    await page.locator(".lbb-shelf-row:not(.lbb-shelf-head)").first().click();

    await expect(page.getByRole("heading", { level: 1 })).toContainText(APELIDO);
  });
});

/**
 * A quarta origem do protótipo (2431–2481).
 *
 * "A partir de um arquivo" e "Importar acervo .lbb" pareciam a mesma operação com extensões
 * diferentes enquanto nenhuma das duas dizia o que fazia. São opostas: uma cria **um** livro a
 * partir de um arquivo, a outra despeja um acervo inteiro e não cria livro nenhum.
 *
 * A origem não ganhou tela própria — um livro que nasce de um PDF é um livro cadastrado com uma
 * fonte anexada, e o app já sabia fazer as duas coisas. O que faltava era dizer que são duas e
 * emendá-las, e é isso que este teste guarda: a promessa da origem termina no lugar de anexar.
 */
test("a origem “a partir de um arquivo” emenda o cadastro com o anexo da fonte", async ({ page }) => {
  const marca = `${Date.now()}`;

  const biblioteca = await page.request.post("/api/libraries", {
    data: { name: `Acervo origem ${marca}` },
  });
  const { library } = (await biblioteca.json()) as { library: { slug: string } };

  await page.goto(`/bibliotecas/${library.slug}`);
  await page.getByRole("button", { name: "Adicionar livro" }).click();

  const origem = page.getByRole("link", { name: /A partir de um arquivo/ });
  await expect(origem).toContainText("PDF, imagem ou EPUB como PDF fonte de um livro novo.");
  await origem.click();

  // A tela avisa na entrada que são dois passos, em vez de deixar o segundo por descobrir.
  await expect(page.getByText("são dois passos, e este é o primeiro")).toBeVisible();

  await page.getByLabel("Título").fill(`Livro de arquivo ${marca}`);
  await page.getByRole("button", { name: "Cadastrar livro" }).click();

  // E a ação primária é a metade que falta — não o editor, que mandaria guardar o arquivo e voltar.
  const anexar = page.getByRole("link", { name: "Anexar a fonte" });
  await expect(anexar).toBeVisible();
  await anexar.click();

  await expect(page).toHaveURL(/\/ingestao$/);
});
