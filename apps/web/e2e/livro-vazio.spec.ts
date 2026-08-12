import { expect, test, type Page } from "@playwright/test";

/**
 * `LIVRO · vazio` (protótipo, 601–642) — o estado que a §4 tinha deixado de fora.
 *
 * O resumo do livro foi implementado com o estado cheio, e o protótipo tem **dois**. Não é a mesma
 * tela com menos coisa: um livro cheio responde "o que falta aqui?"; um livro vazio responde "por
 * onde começo?". A grade de estrutura vazia ao lado da caixa de fonte responde à primeira pergunta
 * com silêncio — que é o que o app fazia.
 *
 * Achado por varredura nova do protótipo, e não pelo ledger: as dez divergências vieram de uma
 * auditoria só, e uma auditoria só não vê tudo.
 */

async function livroVazio(page: Page, marca: string) {
  const biblioteca = await page.request.post("/api/libraries", {
    data: { name: `Acervo vazio ${marca}` },
  });
  const { library } = (await biblioteca.json()) as { library: { id: string } };

  const livro = await page.request.post(`/api/libraries/${library.id}/publications`, {
    data: { title: `Matemática para o ITA ${marca}`, nickname: "ITA 2" },
  });
  const { publication } = (await livro.json()) as { publication: { id: string } };

  return publication.id;
}

test("o livro vazio pergunta “por onde começo?”, e não mostra estrutura vazia", async ({ page }) => {
  const id = await livroVazio(page, `${Date.now()}`);

  await page.goto(`/publications/${id}`);

  await expect(page.getByText("Este livro ainda não tem capítulos nem questões")).toBeVisible();

  // A grade de estrutura e a caixa de fonte **não** aparecem: são a resposta da outra pergunta.
  await expect(page.getByRole("heading", { name: "Estrutura" })).toHaveCount(0);
  await expect(page.locator(".lbb-source")).toHaveCount(0);

  // O eyebrow reconhece o gesto que acabou de acontecer, em tom ok.
  await expect(page.getByText("Livro criado agora")).toBeVisible();

  // E a faixa de pendências some: ela diria "o livro ainda não tem questão nenhuma" a dois
  // centímetros de uma tela inteira dedicada a dizer isso. Repetir o aviso é como se ensina a
  // não ler avisos.
  await expect(page.getByRole("region", { name: "Precisa da sua atenção" })).toHaveCount(0);

  await test.step("as ações são as do começo, e a de capturar é a primária", async () => {
    await expect(page.getByRole("link", { name: "Capturar primeira questão" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Criar primeiro capítulo" })).toBeVisible();

    // Sem fonte anexada, "Abrir PDF fonte" não aparece — botão que não leva a lugar nenhum é pior
    // que botão ausente (§81).
    await expect(page.getByRole("link", { name: "Abrir PDF fonte" })).toHaveCount(0);
  });

  await test.step("“Importar estrutura” não existe, e a promessa do sumário automático também não", async () => {
    /*
     * O protótipo tem a quarta ação e a linha "o sumário do PDF pode virar capítulos
     * automaticamente". Não há leitura de sumário neste app. A frase prometeria trabalho
     * automático justamente a quem está decidindo se faz o trabalho à mão — e o botão abriria um
     * "em breve". Este teste falha se alguém colar os dois de volta sem implementar a coisa.
     */
    await expect(page.getByRole("button", { name: "Importar estrutura" })).toHaveCount(0);
    await expect(page.getByText("sumário do PDF pode virar capítulos")).toHaveCount(0);
  });
});

test("“Criar primeiro capítulo” cria o capítulo, e não manda procurar o menu", async ({ page }) => {
  const id = await livroVazio(page, `${Date.now()}`);

  await page.goto(`/publications/${id}`);
  await page.getByRole("button", { name: "Criar primeiro capítulo" }).click();

  // O editor abre **no capítulo criado** — o botão prometeu um capítulo, não uma tela.
  await expect(page).toHaveURL(new RegExp(`/publications/${id}/editor\\?node=`));
  await expect(page.getByRole("treeitem").filter({ hasText: "Capítulo 1" })).toHaveCount(1);

  const arvore = await page.request.get(`/api/publications/${id}/tree`);
  const { nodes } = (await arvore.json()) as { nodes: { kind: string; title: string }[] };

  expect(nodes).toHaveLength(1);
  expect(nodes[0]).toMatchObject({ kind: "CHAPTER", title: "Capítulo 1" });

  await test.step("e o resumo deixa de ser o do livro vazio", async () => {
    await page.goto(`/publications/${id}`);

    await expect(page.getByText("Este livro ainda não tem capítulos")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Estrutura" })).toBeVisible();
  });
});
