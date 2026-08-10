import { expect, test, type Page } from "@playwright/test";

/**
 * O caminho da §27, num navegador de verdade.
 *
 * Abrir publicação → selecionar questão → editar LaTeX → autosave → render → preview.
 *
 * O que este arquivo tem a dizer e os testes de unidade não têm: **a sequência**. Cada peça já é
 * verificada isolada — o autosave, a rota de render, o preview. O que ninguém verificava é que
 * clicar numa questão deixa o editor pronto para receber texto, que o texto digitado dispara o
 * autosave de verdade, e que o render usa o que acabou de ser salvo.
 *
 * Ver spec §27 · issue #155.
 */

/** A publicação de demonstração. Descoberta pela API, e não fixa: id fixo quebra a cada seed. */
async function primeiraPublicacao(page: Page): Promise<string> {
  const response = await page.request.get("/api/workspaces");
  const { workspaces } = (await response.json()) as { workspaces: { slug: string }[] };
  const slug = workspaces[0]?.slug;
  expect(slug, "nenhum workspace no banco — rode `bun run db:seed`").toBeTruthy();

  const tree = await page.request.get(`/api/publications?workspace=${slug}`);
  if (tree.ok()) {
    const { publications } = (await tree.json()) as { publications?: { id: string }[] };
    const id = publications?.[0]?.id;
    if (id !== undefined) return id;
  }

  // Sem rota de listagem por slug, a página inicial linka as publicações — e é por ela que uma
  // pessoa chegaria também.
  await page.goto("/");
  const link = page.locator('a[href^="/publications/"]').first();
  await expect(link).toBeVisible();

  const href = await link.getAttribute("href");
  return (href ?? "").split("/").pop() ?? "";
}

/**
 * Chega até a primeira questão pelo **teclado**.
 *
 * A árvore nasce com os capítulos abertos e as seções fechadas, e o único gesto de mouse para
 * expandir é um caret com `role="presentation"` — invisível para um seletor por papel, de
 * propósito: ele não é um controle próprio, é parte da linha.
 *
 * Navegar por teclado é melhor aqui do que caçar o pixel do caret: é o que a spec §4.1 promete
 * (`ArrowRight` expande, `ArrowDown` desce), e passar por ele significa que a promessa vale.
 */
async function abrirPrimeiraQuestao(page: Page): Promise<void> {
  const questao = page.getByRole("treeitem").filter({ hasText: /Quest/i }).first();

  await page.getByRole("tree").getByRole("button").first().click();

  // Vinte passos cobrem a maior publicação do acervo com folga. O laço termina no primeiro
  // `Questão` visível — e falha ruidosamente se a navegação por teclado parar de funcionar.
  for (let passo = 0; passo < 20 && (await questao.count()) === 0; passo += 1) {
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowDown");
  }

  await expect(questao, "não cheguei a nenhuma questão pelo teclado").toHaveCount(1, {
    timeout: 5_000,
  });
  await questao.click();
}

test.describe("o caminho da questão", () => {
  test("abrir, selecionar, editar, salvar e renderizar", async ({ page }) => {
    const publicationId = await primeiraPublicacao(page);
    expect(publicationId).not.toBe("");

    // ── abrir publicação ────────────────────────────────────────────────
    await page.goto(`/publications/${publicationId}`);
    const arvore = page.getByRole("tree");
    await expect(arvore).toBeVisible();

    // ── selecionar questão ──────────────────────────────────────────────
    await expect(page.getByRole("treeitem").first()).toBeVisible();
    await abrirPrimeiraQuestao(page);

    const editor = page.getByRole("group", { name: /Editor LaTeX/ });
    await expect(editor).toBeVisible();

    // ── editar LaTeX ────────────────────────────────────────────────────
    // Clicar no **texto**, não no primeiro `textarea`: o Monaco tem dois, e o primeiro é a área
    // de IME, `aria-hidden` e coberta pelo conteúdo — clicar nela dá "outro elemento intercepta
    // o ponteiro". Clicar na linha é o que uma pessoa faz, e é o que põe o cursor onde ela quer.
    await editor.locator(".monaco-editor .view-lines").click();
    await page.keyboard.press("End");

    // Sem espaço dentro da marca: `toContainText` normaliza espaços, e o Monaco reescreve alguns
    // ao digitar — a comparação falharia por um espaço, não pelo que o teste quer afirmar.
    const marca = `%e2e-${Date.now()}`;
    await page.keyboard.type(` ${marca}`);

    // ── autosave ────────────────────────────────────────────────────────
    // "não salvo" primeiro: sem ver este estado, "salvo" poderia ser o selo que já estava lá.
    //
    // `exact` nos dois: sem ele, "salvo" casa **dentro** de "não salvo", e o teste passaria
    // afirmando o contrário do que quer afirmar.
    await expect(page.getByText("não salvo", { exact: true })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("salvo", { exact: true })).toBeVisible({ timeout: 15_000 });

    // O que foi digitado **está no servidor**, e não só na tela.
    await page.reload();
    await abrirPrimeiraQuestao(page);

    const recarregado = page.getByRole("group", { name: /Editor LaTeX/ });
    await expect(recarregado).toContainText(marca);

    // E desfaz. O teste não deve deixar resíduo no acervo de demonstração — a próxima execução
    // encontraria a questão crescida pela anterior, e em dez execuções o enunciado seria uma
    // fileira de marcas de teste.
    await recarregado.locator(".monaco-editor .view-lines").click();
    await page.keyboard.press("End");
    // +1 pelo espaço que separou a marca do enunciado.
    for (let i = 0; i < marca.length + 1; i += 1) await page.keyboard.press("Backspace");

    await expect(page.getByText("salvo", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(recarregado).not.toContainText("e2e");
  });

  /**
   * Bloqueado pela issue #156, e é o **E2E que a achou**.
   *
   * Compilar uma questão cujo fonte mudou mas cuja **saída é idêntica** — acrescentar um
   * comentário LaTeX basta — cria um job novo apontando para bytes que já existem, e
   * `Asset.storageKey @unique` derruba a gravação com 500. A tela diz "Falha ao compilar", que é
   * mentira: a compilação deu certo.
   *
   * Fica `fixme` e não removido: um teste apagado leva o achado junto. A correção é de schema e
   * está descrita na issue.
   */
  test.fixme("render compila e o resultado aparece na tela", async ({ page }) => {
    const publicationId = await primeiraPublicacao(page);

    await page.goto(`/publications/${publicationId}`);
    await abrirPrimeiraQuestao(page);
    await expect(page.getByRole("group", { name: /Editor LaTeX/ })).toBeVisible();

    // `tab` e não `button`: o design system usa `role="tablist"`/`role="tab"`, que é o que um
    // leitor de tela precisa para anunciar "aba 2 de 4".
    await page.getByRole("tab", { name: "PDF compilado" }).click();

    const compilar = page.getByRole("button", { name: /Compilar|Renderizar/i }).first();
    await expect(compilar).toBeVisible();
    await compilar.click();

    // Ou o PDF, ou "worker fora do ar" — os dois são resultados legítimos, e o que **não** pode
    // acontecer é a tela ficar em "compilando" para sempre. Sem o segundo caso, este teste só
    // passaria na máquina de quem está com o contêiner de pé.
    const pronto = page.locator("object[type='application/pdf'], img[alt*='ágina']").first();
    const indisponivel = page.getByText(/worker.*(não respondeu|fora do ar)|não configurado/i);

    await expect(pronto.or(indisponivel)).toBeVisible({ timeout: 45_000 });
  });

  test("o preview rápido aparece sem passar pelo servidor", async ({ page }) => {
    const publicationId = await primeiraPublicacao(page);

    await page.goto(`/publications/${publicationId}`);
    await abrirPrimeiraQuestao(page);

    // O aviso é permanente e é parte do contrato com quem lê: preview rápido **pode** diferir.
    await expect(page.getByText(/pode diferir do PDF final/i)).toBeVisible();
  });
});
