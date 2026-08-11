import { expect, type Page } from "@playwright/test";

/**
 * Como os E2E acham e abrem uma questão.
 *
 * Os quatro specs faziam a mesma coisa por conta própria: `goto("/")`, o primeiro
 * `a[href^="/publications/"]`, e depois `ArrowRight`/`ArrowDown` até aparecer um `treeitem` cujo
 * texto casasse com `/Quest/i`. As duas metades envelheceram juntas:
 *
 * - "o primeiro link da Home" virou, com a Home real, quase sempre um livro **vazio**;
 * - "o rótulo contém `Quest`" valia porque a questão importada se chamava "Questão 27". Uma
 *   questão criada dentro do produto se chama pelo começo do enunciado, e nenhuma delas casa.
 *
 * O que estes testes precisam não é "a primeira publicação" nem "uma linha com Quest": é **uma
 * questão para editar**. Perguntar isso à API é exato e não depende de qual tela lista o quê nem
 * de como o nó se chama.
 */

interface TreeNode {
  readonly id: string;
  readonly question: { readonly id: string } | null;
}

export interface QuestaoAberta {
  readonly publicationId: string;
  readonly nodeId: string;
}

/** Uma publicação com questão, e o nó dela. Falha com mensagem útil quando não há nenhuma. */
export async function acharQuestao(page: Page): Promise<QuestaoAberta> {
  const catalogo = await page.request.get("/api/publications");
  expect(catalogo.ok(), "a lista de publicações não respondeu").toBeTruthy();

  const { publications } = (await catalogo.json()) as {
    publications?: { id: string; questionCount: number }[];
  };

  expect(publications?.length, "nenhuma publicação no banco — rode `bun run setup`").toBeTruthy();

  // A contagem vem do catálogo; a árvore confirma que a questão está **viva** e dá o nó, que é o
  // que a navegação usa.
  for (const entry of (publications ?? []).filter((row) => row.questionCount > 0)) {
    const tree = await page.request.get(`/api/publications/${entry.id}/tree`);
    if (!tree.ok()) continue;

    const { nodes } = (await tree.json()) as { nodes?: TreeNode[] };
    const comQuestao = nodes?.find((node) => node.question !== null);

    if (comQuestao) return { publicationId: entry.id, nodeId: comQuestao.id };
  }

  throw new Error(
    "nenhuma publicação tem questão — rode `bun run db:seed` antes dos E2E que editam questão",
  );
}

/** Compatibilidade com os specs que só querem o id da publicação. */
export const publicacaoComQuestao = async (page: Page): Promise<string> =>
  (await acharQuestao(page)).publicationId;

/**
 * Abre uma questão pelo `?node=` — o mesmo caminho da busca global e do "Continuar" da Home.
 *
 * Determinístico, e não menos real que caçar a linha na árvore: é por esta rota que o produto
 * leva alguém a uma questão específica. A árvore abre o ramo sozinha para mostrar o selecionado —
 * comportamento que tem teste próprio em `tests/tree.test.tsx`.
 */
export async function abrirQuestao(page: Page): Promise<QuestaoAberta> {
  const alvo = await acharQuestao(page);

  await page.goto(`/publications/${alvo.publicationId}?node=${alvo.nodeId}`);
  await expect(page.getByRole("group", { name: /Editor LaTeX/ })).toBeVisible();

  return alvo;
}

/**
 * Reseleciona a questão na publicação já aberta.
 *
 * Usado depois de um `reload`, quando a URL já traz o `?node=` e só falta esperar o editor voltar.
 */
export async function abrirPrimeiraQuestao(page: Page): Promise<void> {
  if (!page.url().includes("node=")) {
    await abrirQuestao(page);
    return;
  }

  await expect(page.getByRole("group", { name: /Editor LaTeX/ })).toBeVisible();
}
