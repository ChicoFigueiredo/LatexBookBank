import { expect, test, type Page } from "@playwright/test";

/**
 * Excluir uma biblioteca pelo menu de três pontos.
 *
 * O que só um navegador tem a dizer aqui: o menu **abre** — o botão não fica soterrado pelo link
 * do card, que é o erro clássico de aninhar controle dentro de âncora — e o botão vermelho só
 * funciona depois do nome digitado. As duas coisas são invisíveis para o teste de unidade do caso
 * de uso, que já cobre a regra da confirmação.
 *
 * Cria a própria biblioteca e apaga só ela: a suíte roda contra o banco de desenvolvimento, e um
 * teste de exclusão que mirasse no que já estava lá seria um teste que destrói dados de verdade.
 */

const nomeUnico = () => `Acervo Descartável ${Date.now()}`;

async function criarBiblioteca(page: Page, nome: string): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Criar biblioteca" }).first().click();

  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("Nome").fill(nome);
  await dialogo.getByRole("button", { name: "Criar biblioteca" }).click();

  // O diálogo para no "e agora?" — daqui a exclusão só precisa que a biblioteca exista.
  await dialogo.getByRole("link", { name: "Abrir biblioteca" }).click();
  await expect(page.getByRole("heading", { name: nome })).toBeVisible();
}

/** Abre o menu de ações do card daquela biblioteca, na tela de Bibliotecas. */
async function abrirMenuDoCard(page: Page, nome: string): Promise<void> {
  await page.goto("/bibliotecas");
  await expect(page.getByRole("link", { name: new RegExp(nome) })).toBeVisible();

  await page.getByRole("button", { name: `Ações da biblioteca ${nome}` }).click();
  await expect(page.getByRole("menuitem", { name: "Excluir" })).toBeVisible();
}

test("o menu de três pontos exclui a biblioteca, e só depois do nome digitado", async ({
  page,
}) => {
  const nome = nomeUnico();
  await criarBiblioteca(page, nome);

  await abrirMenuDoCard(page, nome);
  await page.getByRole("menuitem", { name: "Excluir" }).click();

  const dialogo = page.getByRole("dialog");
  await expect(dialogo.getByRole("heading", { name: `Excluir “${nome}”?` })).toBeVisible();

  // Vazia de verdade: o diálogo busca os números do servidor ao abrir.
  await expect(dialogo.getByText("A biblioteca está vazia.")).toBeVisible();

  const excluir = dialogo.getByRole("button", { name: "Excluir biblioteca" });
  await expect(excluir).toBeDisabled();

  // Nome quase certo não libera — é o ponto inteiro da confirmação.
  await dialogo.getByRole("textbox").fill(nome.toLowerCase());
  await expect(excluir).toBeDisabled();

  await dialogo.getByRole("textbox").fill(nome);
  await expect(excluir).toBeEnabled();
  await excluir.click();

  await expect(dialogo).not.toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(nome) })).toHaveCount(0);

  // E continua sumida depois de recarregar: a tela não mentiu sobre o que o banco fez.
  await page.reload();
  await expect(page.getByRole("link", { name: new RegExp(nome) })).toHaveCount(0);
});

test("cancelar não exclui", async ({ page }) => {
  const nome = nomeUnico();
  await criarBiblioteca(page, nome);

  await abrirMenuDoCard(page, nome);
  await page.getByRole("menuitem", { name: "Excluir" }).click();

  const dialogo = page.getByRole("dialog");
  await dialogo.getByRole("textbox").fill(nome);
  await dialogo.getByRole("button", { name: "Cancelar" }).click();

  await expect(page.getByRole("link", { name: new RegExp(nome) })).toBeVisible();

  // Limpeza: o teste não deixa lixo no banco de desenvolvimento.
  const libraries = await page.request.get("/api/libraries");
  const { libraries: rows } = (await libraries.json()) as { libraries: { id: string; name: string }[] };
  const alvo = rows.find((row) => row.name === nome);
  if (alvo) {
    await page.request.delete(`/api/libraries/${alvo.id}`, { data: { name: nome } });
  }
});
