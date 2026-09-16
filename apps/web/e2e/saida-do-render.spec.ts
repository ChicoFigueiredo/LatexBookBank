import { expect, test } from "@playwright/test";

/**
 * **A saída do render** — `Aluno` · `Professor` (protótipo, 1064–1091 e 1168–1172).
 *
 * O app sabia compilar as duas desde sempre: `includeSolution` atravessa a rota, o bundle e todos
 * os plugins de tipo. O editor nunca pedia — `useRender` mandava `{}` no corpo. Quem escrevia a
 * resolução recebia um PDF sem ela, e nada na tela dizia que existia outra saída.
 *
 * Este teste guarda as duas metades:
 *
 *   1. escolher `Professor` faz gabarito e resolução **entrarem no documento** — conferido na aba
 *      `Fonte`, que mostra o corpo que o servidor montou, e não o rascunho da tela;
 *   2. trocar a saída depois de compilar **avisa** que o resultado na tela é do outro modo. Sem
 *      isso, baixar o PDF aberto entrega o arquivo de aluno para quem tem certeza de estar
 *      levando o com gabarito.
 *
 * O fixture é próprio, e essa é a lição de percurso: a primeira versão reaproveitava “a primeira
 * questão do acervo”, que era o resto de outra rodada — **sem gabarito e sem resolução**. As duas
 * saídas davam o mesmo documento, o mesmo hash de cache, e o teste teria passado por coincidência
 * dizendo que a herança funcionava.
 */

test("a saída de professor leva gabarito e resolução, e trocar de saída avisa o que está velho", async ({
  page,
}) => {
  const marca = `${Date.now()}`;

  const biblioteca = await page.request.post("/api/libraries", {
    data: { name: `Acervo saída ${marca}` },
  });
  expect(biblioteca.ok()).toBeTruthy();
  const { library } = (await biblioteca.json()) as { library: { id: string } };

  const livro = await page.request.post(`/api/libraries/${library.id}/publications`, {
    data: { title: `Livro saída ${marca}` },
  });
  expect(livro.ok()).toBeTruthy();
  const { publication } = (await livro.json()) as { publication: { id: string } };

  const criada = await page.request.post(`/api/publications/${publication.id}/questions`, {
    data: { type: "MULTIPLE_CHOICE", placement: { kind: "lastChild", parentId: null } },
  });
  expect(criada.ok()).toBeTruthy();
  const { questionId, nodeId } = (await criada.json()) as { questionId: string; nodeId: string };

  const base = `/api/publications/${publication.id}/questions/${questionId}`;

  // Enunciado e **resolução**: sem os dois, as duas saídas produzem o mesmo documento e o teste
  // não mede nada.
  const arvore = await page.request.get(`/api/publications/${publication.id}/tree`);
  const { nodes } = (await arvore.json()) as {
    nodes: readonly {
      question: {
        id: string;
        version: string;
        options: readonly { id: string }[];
      } | null;
    }[];
  };
  const questao = nodes.find((node) => node.question?.id === questionId)?.question;
  expect(questao, "a questão precisa estar na árvore").toBeTruthy();

  const escrita = await page.request.patch(base, {
    data: {
      statementLatex: "Quanto vale $2+2$?",
      solutionLatex: "Somando, $2+2=4$.",
      expectedVersion: questao?.version,
    },
  });
  expect(escrita.ok()).toBeTruthy();

  const primeiraAlternativa = questao?.options[0]?.id;
  expect(primeiraAlternativa, "a escolha simples nasce com alternativas").toBeTruthy();

  const gabarito = await page.request.patch(`${base}/options/${primeiraAlternativa}`, {
    data: { statementLatex: "$4$", isCorrect: true },
  });
  expect(gabarito.ok()).toBeTruthy();

  await page.goto(`/publications/${publication.id}/editor?node=${nodeId}`);
  await expect(page.getByRole("group", { name: /Editor LaTeX/ })).toBeVisible();

  await page.getByRole("tab", { name: "PDF compilado" }).click();

  const saida = page.getByRole("group", { name: "O que entra no render" });
  await expect(saida).toBeVisible();

  await test.step("o padrão é Aluno, e ele diz o que entra", async () => {
    // O resumo em mono ao lado das pílulas — sem gabarito. É o que faltava: a tela nunca disse
    // qual era a saída, então parecia haver só uma.
    await expect(page.getByText("enunciado · alternativas", { exact: true })).toBeVisible();
  });

  const compilar = page.getByRole("button", { name: /Compilar/i }).first();
  const indisponivel = page.getByText(/worker.*(não respondeu|fora do ar)|não configurado/i);
  const pronto = page.locator("object[type='application/pdf'], img[alt*='ágina']").first();

  await compilar.click();
  await expect(pronto.or(indisponivel)).toBeVisible({ timeout: 45_000 });

  await test.step("trocar para Professor **avisa** que o que está na tela é de antes", async () => {
    await saida.getByRole("button", { name: "Professor" }).click();

    await expect(page.getByText("Este resultado é de outra saída")).toBeVisible();
    await expect(
      page.getByText(/compilado na saída Aluno.*escolhida agora é Professor/),
    ).toBeVisible();
    await expect(page.getByText("enunciado · alternativas · gabarito · resolução")).toBeVisible();
  });

  await test.step("compilar de novo tira o aviso", async () => {
    await compilar.click();
    await expect(pronto.or(indisponivel)).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText("Este resultado é de outra saída")).toBeHidden();
  });

  await test.step("e o gabarito e a resolução **entraram no documento**", async () => {
    // A aba `Fonte` mostra o `.tex` que o servidor mandou ao compilador: é a evidência de que a
    // escolha atravessou a rota, e não só mudou a cor de um botão.
    await page.getByRole("tab", { name: /Fonte/ }).click();

    const fonte = page.locator("pre, code").filter({ hasText: "Quanto vale" }).first();
    await expect(fonte).toContainText("Gabarito", { timeout: 10_000 });
    await expect(fonte).toContainText("Resolução");
  });
});
