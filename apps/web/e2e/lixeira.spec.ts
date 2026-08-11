import { expect, test, type Page } from "@playwright/test";

/**
 * **Excluir e restaurar** (§32 e §33).
 *
 * O que a §32 quer evitar tem nome: `DocumentNode` excluído + `Question` órfã. A semântica que o
 * produto escolheu é **soft delete do agregado** — excluir o nó leva a descendência junto, e a
 * questão vai com o nó dela. Restaurar traz tudo de volta, na mesma posição.
 *
 * A §33 acrescenta a parte que este teste existe para provar: *"o usuário não deve conhecer a
 * diferença interna"*. Ele exclui um capítulo com uma questão dentro, restaura o capítulo, e
 * encontra a questão de volta — sem em momento nenhum saber que por baixo são duas linhas em
 * tabelas diferentes.
 *
 * A lixeira também tinha endpoint desde a Fase 2 e **nenhuma tela**. Dava para excluir e não dava
 * para ver o que foi excluído — o tipo de meia-jornada que a §49 recusa.
 */

const carimbo = () => `${Date.now()}`;

async function livroComQuestao(page: Page, marca: string): Promise<string> {
  const biblioteca = await page.request.post("/api/libraries", {
    data: { name: `Acervo lixeira ${marca}` },
  });
  const { library } = (await biblioteca.json()) as { library: { id: string } };

  const livro = await page.request.post(`/api/libraries/${library.id}/publications`, {
    data: { title: `Livro da lixeira ${marca}` },
  });
  const { publication } = (await livro.json()) as { publication: { id: string } };

  const capitulo = await page.request.post(`/api/publications/${publication.id}/nodes`, {
    data: { kind: "CHAPTER", title: "Capítulo a excluir", placement: { kind: "lastChild", parentId: null } },
  });
  const { id: capituloId } = (await capitulo.json()) as { id: string };

  const questao = await page.request.post(`/api/publications/${publication.id}/questions`, {
    data: { type: "MULTIPLE_CHOICE", placement: { kind: "lastChild", parentId: capituloId } },
  });
  expect(questao.ok(), "não deu para criar a questão").toBeTruthy();

  return publication.id;
}

test("excluir leva a questão junto, e restaurar traz os dois de volta", async ({ page }) => {
  const publicationId = await livroComQuestao(page, carimbo());

  await page.goto(`/publications/${publicationId}`);

  await test.step("excluir o capítulo — a confirmação diz o que vai junto", async () => {
    // A **linha**, não o `treeitem`: o `li` do capítulo engloba o do filho, e o clique no centro
    // da caixa dele cai na questão. Foi o que a primeira versão deste teste fez — e excluiu a
    // questão em vez do capítulo, sem que a asserção seguinte explicasse por quê.
    await page.getByRole("tree").getByRole("button", { name: "Capítulo a excluir" }).click();
    await page.keyboard.press("Delete");

    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toContainText("tudo que está abaixo deste nó");
    await dialogo.getByRole("button", { name: "Excluir" }).click();

    // A árvore fica vazia: o capítulo **e** a questão saíram.
    await expect(page.getByRole("treeitem")).toHaveCount(0);
  });

  await test.step("a lixeira mostra os dois, e diz qual pode voltar sozinho", async () => {
    await page.getByRole("button", { name: "Lixeira" }).click();

    const dialogo = page.getByRole("dialog");
    await expect(dialogo.getByText("Capítulo a excluir")).toBeVisible();

    // A questão está na lixeira **e não pode voltar sozinha**: ela voltaria apontando para um pai
    // invisível, sumiria da árvore de novo, e a restauração pareceria ter falhado calada.
    await expect(dialogo.getByText("restaure o pai antes")).toBeVisible();
  });

  await test.step("restaurar o capítulo traz a questão junto, na posição", async () => {
    const dialogo = page.getByRole("dialog");
    await dialogo.getByRole("button", { name: "Restaurar" }).click();

    await expect(dialogo.getByText("Nada na lixeira")).toBeVisible();
    await page.getByRole("button", { name: "Fechar" }).click();

    // O usuário não conheceu a diferença interna: excluiu um capítulo, restaurou um capítulo, e a
    // questão está de volta dentro dele.
    await expect(page.getByRole("treeitem").filter({ hasText: "Capítulo a excluir" })).toHaveCount(1);

    const tree = await page.request.get(`/api/publications/${publicationId}/tree`);
    const { nodes } = (await tree.json()) as {
      nodes: { kind: string; depth: number; question: unknown | null }[];
    };

    expect(nodes).toHaveLength(2);
    expect(nodes[1]).toMatchObject({ kind: "QUESTION", depth: 1 });
    expect(nodes[1]?.question).not.toBeNull();
  });
});
