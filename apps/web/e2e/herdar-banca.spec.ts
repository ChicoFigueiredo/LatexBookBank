import { expect, test } from "@playwright/test";

/**
 * **Herda banca e ano da questão anterior** — protótipo, linha 2229.
 *
 * “Herda livro, capítulo e metadados da questão anterior.” Livro e capítulo o app já herdava: são
 * o destino escolhido na árvore. Metadados, não — cada questão nascia com banca e ano vazios, e
 * cadastrar uma prova inteira era digitar `FUVEST` e `2019` quarenta vezes.
 *
 * O que este teste guarda é a ponta a ponta: o valor **chega ao banco**, e não só à tela.
 */

interface Criada {
  readonly nodeId: string;
  readonly questionId: string;
  readonly inherited: { readonly board: string | null; readonly year: number | null } | null;
}

test("a questão nova nasce com a banca e o ano da anterior", async ({ page }) => {
  const marca = `${Date.now()}`;

  const biblioteca = await page.request.post("/api/libraries", {
    data: { name: `Acervo herança ${marca}` },
  });
  expect(biblioteca.ok()).toBeTruthy();
  const { library } = (await biblioteca.json()) as { library: { id: string } };

  const livro = await page.request.post(`/api/libraries/${library.id}/publications`, {
    data: { title: `Prova ${marca}` },
  });
  expect(livro.ok()).toBeTruthy();
  const { publication } = (await livro.json()) as { publication: { id: string } };

  const capitulo = await page.request.post(`/api/publications/${publication.id}/nodes`, {
    data: { kind: "CHAPTER", title: "Prova de 2019", placement: { kind: "lastChild", parentId: null } },
  });
  expect(capitulo.ok()).toBeTruthy();
  const { id: capituloId } = (await capitulo.json()) as { id: string };

  const primeira = await page.request.post(`/api/publications/${publication.id}/questions`, {
    data: { type: "MULTIPLE_CHOICE", placement: { kind: "lastChild", parentId: capituloId } },
  });
  expect(primeira.ok()).toBeTruthy();
  const { questionId } = (await primeira.json()) as Criada;

  await test.step("a primeira nasce sem banca — não há de quem herdar", async () => {
    const criada = (await primeira.json()) as Criada;
    expect(criada.inherited).toBeNull();
  });

  // A banca entra à mão na primeira, como quem cadastra faz uma vez. `expectedVersion` porque o
  // `PATCH` é o mesmo do autosave, e ele recusa escrita sem versão (§42).
  const antes = await page.request.get(`/api/publications/${publication.id}/tree`);
  const { nodes: arvoreAntes } = (await antes.json()) as {
    nodes: readonly { question: { id: string; version: string } | null }[];
  };
  const versao = arvoreAntes.find((node) => node.question?.id === questionId)?.question?.version;
  expect(versao).toBeTruthy();

  const marcada = await page.request.patch(
    `/api/publications/${publication.id}/questions/${questionId}`,
    { data: { board: "FUVEST", year: 2019, expectedVersion: versao } },
  );
  expect(marcada.ok()).toBeTruthy();

  await test.step("a segunda herda, e o servidor **diz** o que herdou", async () => {
    const segunda = await page.request.post(`/api/publications/${publication.id}/questions`, {
      data: { type: "DISCURSIVE", placement: { kind: "lastChild", parentId: capituloId } },
    });
    expect(segunda.ok()).toBeTruthy();

    const criada = (await segunda.json()) as Criada;
    expect(criada.inherited).toMatchObject({ board: "FUVEST", year: 2019 });

    // E chegou ao banco, que é a afirmação que importa: a resposta poderia dizer a verdade sobre
    // uma escrita que não aconteceu.
    const arvore = await page.request.get(`/api/publications/${publication.id}/tree`);
    const { nodes } = (await arvore.json()) as {
      nodes: readonly { id: string; question: { id: string; source: string | null } | null }[];
    };

    const nova = nodes.find((node) => node.question?.id === criada.questionId);
    expect(nova?.question?.source).toBe("FUVEST · 2019");
  });

  await test.step("e o menu anuncia antes do clique, em vez de preencher em silêncio", async () => {
    await page.goto(`/publications/${publication.id}/editor`);

    await page.getByRole("button", { name: "Adicionar" }).click();
    await expect(page.getByText("herda FUVEST · 2019 da anterior")).toBeVisible();
  });
});
