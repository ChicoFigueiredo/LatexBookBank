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

  await page.getByRole("button", { name: "Limpar filtro" }).click();
  await expect(tabela.getByRole("row")).toHaveCount(antes);
});
