import { expect, test, type Page } from "@playwright/test";

/**
 * A lixeira do acervo inteiro (protótipo, 1889–1921).
 *
 * O que a tela por publicação não responde: *"apaguei alguma coisa e não lembro onde"*. Quem não
 * lembra o livro não tem por onde começar — precisaria abrir todos.
 *
 * Dois contratos, e o segundo é o que justifica o teste existir contra banco de verdade:
 *
 * 1. **Uma linha por ato de exclusão.** Excluir um grupo com questões dentro apaga N linhas em
 *    `document_nodes` e é uma decisão só; a lixeira mostra uma linha, com o que ela levou junto e
 *    a promessa numérica de quanto volta.
 * 2. **Esvaziar não deixa questão órfã.** `DocumentNode.questionId` aponta para `Question`, e não
 *    há cascade nesse sentido: apagar só o nó deixaria a questão viva, invisível em qualquer tela
 *    e contando nos totais para sempre. O sintoma seria um número que não fecha — o defeito mais
 *    caro de achar depois.
 */

const carimbo = () => `${Date.now()}`;

async function livroComGrupoDeQuestoes(page: Page, marca: string, quantas: number) {
  const biblioteca = await page.request.post("/api/libraries", {
    data: { name: `Acervo lixeira global ${marca}` },
  });
  const { library } = (await biblioteca.json()) as { library: { id: string } };

  const livro = await page.request.post(`/api/libraries/${library.id}/publications`, {
    data: { title: `Livro global ${marca}` },
  });
  const { publication } = (await livro.json()) as { publication: { id: string } };

  const grupo = await page.request.post(`/api/publications/${publication.id}/nodes`, {
    data: {
      kind: "QUESTION_GROUP",
      title: `Exercícios complementares ${marca}`,
      placement: { kind: "lastChild", parentId: null },
    },
  });
  const { id: grupoId } = (await grupo.json()) as { id: string };

  const questionIds: string[] = [];
  for (let i = 0; i < quantas; i += 1) {
    const questao = await page.request.post(`/api/publications/${publication.id}/questions`, {
      data: { type: "MULTIPLE_CHOICE", placement: { kind: "lastChild", parentId: grupoId } },
    });
    expect(questao.ok(), "não deu para criar a questão").toBeTruthy();
    const criada = (await questao.json()) as { question?: { id: string }; id?: string };
    const id = criada.question?.id ?? criada.id;
    if (id) questionIds.push(id);
  }

  return { publicationId: publication.id, grupoId, marca, questionIds };
}

test("um ato de exclusão é uma linha, com o que levou junto e o quanto volta", async ({ page }) => {
  const { publicationId, grupoId, marca } = await livroComGrupoDeQuestoes(page, carimbo(), 3);

  const excluir = await page.request.delete(
    `/api/publications/${publicationId}/nodes/${grupoId}`,
  );
  expect(excluir.ok(), "não deu para excluir o grupo").toBeTruthy();

  await page.goto("/lixeira");

  const linha = page.locator(".lbb-trash-row").filter({ hasText: `Exercícios complementares ${marca}` });
  await expect(linha, "o grupo excluído precisa ser UMA linha, não quatro").toHaveCount(1);

  // O aviso que decide se vale restaurar: aquelas três só voltam por aqui.
  await expect(linha).toContainText("levou 3 questões com ele");
  await expect(linha).toContainText(`Livro global ${marca}`);

  // A promessa é numérica e inclui o próprio grupo: 3 questões + o grupo = 4.
  await expect(linha.getByRole("button", { name: "Restaurar (4 itens)" })).toBeVisible();

  await test.step("restaurar devolve exatamente o que prometeu", async () => {
    await linha.getByRole("button", { name: "Restaurar (4 itens)" }).click();
    await expect(linha).toHaveCount(0);

    const tree = await page.request.get(`/api/publications/${publicationId}/tree`);
    const { nodes } = (await tree.json()) as { nodes: { kind: string }[] };

    expect(nodes).toHaveLength(4);
    expect(nodes.filter((node) => node.kind === "QUESTION")).toHaveLength(3);
  });
});

test("esvaziar exige a palavra e deixa a lixeira vazia", async ({ page }) => {
  const marca = carimbo();
  const { publicationId, grupoId } = await livroComGrupoDeQuestoes(page, marca, 2);

  await page.request.delete(`/api/publications/${publicationId}/nodes/${grupoId}`);

  await page.goto("/lixeira");
  await page.getByRole("button", { name: "Esvaziar lixeira" }).click();

  const dialogo = page.getByRole("dialog");
  await expect(dialogo).toContainText("Não há lixeira da lixeira");

  await test.step("o botão só liga com a palavra digitada", async () => {
    const apagar = dialogo.getByRole("button", { name: "Apagar de vez" });
    await expect(apagar).toBeDisabled();

    await dialogo.getByRole("textbox").fill("esvaziar");
    await expect(apagar, "a confirmação não deveria depender de caixa").toBeEnabled();
    await apagar.click();
  });

  await expect(page.getByText("A lixeira está vazia")).toBeVisible();

  const arvore = await page.request.get(`/api/publications/${publicationId}/tree`);
  const { nodes } = (await arvore.json()) as { nodes: unknown[] };
  expect(nodes).toHaveLength(0);
});

/**
 * O contrato que a tela não consegue provar sozinha: **a questão sai com o nó**.
 *
 * `DocumentNode.questionId` aponta para `Question`, e não há cascade nesse sentido. Apagar só o nó
 * deixaria a questão viva, invisível em qualquer tela e contando nos totais para sempre — um
 * vazamento cujo sintoma é um número que não fecha, meses depois. Só a resposta do `DELETE` diz
 * quantas linhas de cada tabela saíram, e é por isso que ela devolve as duas contagens.
 */
test("esvaziar não deixa questão órfã no banco", async ({ page }) => {
  const { publicationId, grupoId } = await livroComGrupoDeQuestoes(page, carimbo(), 2);
  await page.request.delete(`/api/publications/${publicationId}/nodes/${grupoId}`);

  const resposta = await page.request.delete("/api/trash");
  expect(resposta.ok(), "não deu para esvaziar").toBeTruthy();

  const { deleted } = (await resposta.json()) as {
    deleted: { nodes: number; questions: number };
  };

  // O grupo mais as duas questões saíram como nós, e as duas questões saíram também da tabela
  // delas. Se `questions` viesse 0 com `nodes` em 3, seria exatamente o vazamento.
  expect(deleted.nodes).toBeGreaterThanOrEqual(3);
  expect(deleted.questions).toBeGreaterThanOrEqual(2);
});
