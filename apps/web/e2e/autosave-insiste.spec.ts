import { expect, test, type Page } from "@playwright/test";

/**
 * **O autosave desistia calado** (protótipo, 706–712).
 *
 * O `catch` marcava `error`, um selo de três letras acendia num canto da barra de abas, e nada
 * mais acontecia. A próxima tecla reagendava o salvamento — então quem continuava escrevendo se
 * recuperava sozinho e nunca via o problema, e quem terminava o parágrafo e parava, que é o caso
 * normal de quem acabou de escrever alguma coisa, ficava com o texto só na tela.
 *
 * Um blip de rede de dois segundos custava o último parágrafo. O sintoma era três letras.
 *
 * Este teste **derruba a rota de gravação de propósito** e confere as duas metades da correção: a
 * frase que responde "perdi meu texto?" antes de a pessoa perguntar, e a insistência — pelo botão,
 * que é a versão observável dos 30 s automáticos.
 */

async function questaoAberta(page: Page): Promise<{ publicationId: string; nodeId: string }> {
  const marca = `${Date.now()}`;

  const biblioteca = await page.request.post("/api/libraries", {
    data: { name: `Acervo autosave ${marca}` },
  });
  const { library } = (await biblioteca.json()) as { library: { id: string } };

  const livro = await page.request.post(`/api/libraries/${library.id}/publications`, {
    data: { title: `Livro autosave ${marca}` },
  });
  const { publication } = (await livro.json()) as { publication: { id: string } };

  const capitulo = await page.request.post(`/api/publications/${publication.id}/nodes`, {
    data: { kind: "CHAPTER", title: "Capítulo", placement: { kind: "lastChild", parentId: null } },
  });
  const { id: capituloId } = (await capitulo.json()) as { id: string };

  const questao = await page.request.post(`/api/publications/${publication.id}/questions`, {
    data: { type: "MULTIPLE_CHOICE", placement: { kind: "lastChild", parentId: capituloId } },
  });
  expect(questao.ok(), "não deu para criar a questão").toBeTruthy();

  const arvore = await page.request.get(`/api/publications/${publication.id}/tree`);
  const { nodes } = (await arvore.json()) as { nodes: { id: string; kind: string }[] };
  const alvo = nodes.find((node) => node.kind === "QUESTION");
  expect(alvo, "a questão precisa estar na árvore").toBeTruthy();

  return { publicationId: publication.id, nodeId: alvo?.id ?? "" };
}

test("quando o salvamento falha, a tela diz que o texto não se perdeu — e insiste", async ({
  page,
}) => {
  const marca = `${Date.now()}`;
  const { publicationId, nodeId } = await questaoAberta(page);

  // A rota de gravação cai. É o blip de rede, reproduzido de propósito: sem derrubá-la, este
  // teste passaria por sorte e não provaria nada sobre o caminho de falha.
  let derrubada = true;
  await page.route(`**/api/publications/${publicationId}/questions/*`, async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    if (!derrubada) return route.continue();

    await route.abort("failed");
  });

  await page.goto(`/publications/${publicationId}/editor?node=${nodeId}`);

  // Monaco, e não um `<textarea>`: `fill()` não passa pelo editor. `delay` porque `type()` sem
  // intervalo dispara mais rápido do que o Monaco processa e o editor perde caracteres — a mesma
  // lição que `questao.spec.ts` já tinha aprendido caro.
  const editor = page.getByRole("group", { name: /Editor LaTeX/ });
  await expect(editor).toBeVisible();
  await editor.locator(".monaco-editor .view-lines").click();
  // Um marcador curto, como em `questao.spec.ts`: mesmo com `delay`, uma frase inteira dá ao
  // Monaco trinta chances de perder um caractere, e o teste passaria a falhar pela digitação em
  // vez de pelo que ele mede.
  await page.keyboard.type(` %auto-${marca}`, { delay: 80 });

  await test.step("a frase responde “perdi meu texto?” antes de a pessoa perguntar", async () => {
    await expect(page.getByText("O salvamento automático falhou")).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText("O texto continua aqui e nada foi perdido — tentamos de novo a cada 30 s."),
    ).toBeVisible();
  });

  await test.step("e a insistência é oferecida, não só prometida", async () => {
    const tentar = page.getByRole("button", { name: "Tentar agora" });
    await expect(tentar).toBeVisible();

    // A rede volta. O botão é a versão observável dos 30 s — esperar meio minuto num e2e seria
    // trocar cobertura por paciência, e o caminho de código é o mesmo `save()`.
    derrubada = false;
    await tentar.click();

    await expect(page.getByText("O salvamento automático falhou")).toBeHidden({ timeout: 15_000 });
  });

  await test.step("e o texto chegou ao banco — que é a única prova que importa", async () => {
    const arvore = await page.request.get(`/api/publications/${publicationId}/tree`);
    const { nodes } = (await arvore.json()) as {
      nodes: { question: { statementLatex?: string } | null }[];
    };

    const questao = nodes.find((node) => node.question !== null)?.question;
    expect(questao?.statementLatex).toContain(`%auto-${marca}`);
  });
});

test("conflito não ganha “Tentar agora” — insistir num 409 é vencer por repetição", async ({
  page,
}) => {
  const { publicationId, nodeId } = await questaoAberta(page);

  // 409 é outra coisa: alguém **já gravou**. A §42 diz que conflito nunca sobrescreve, e um
  // autosave que insiste num 409 briga pela versão de quem está com a tela aberta — e vence por
  // repetição, que é a pior forma de decidir de quem é o texto.
  await page.route(`**/api/publications/${publicationId}/questions/*`, async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();

    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ message: "Esta questão mudou desde que você abriu." }),
    });
  });

  await page.goto(`/publications/${publicationId}/editor?node=${nodeId}`);

  const editor = page.getByRole("group", { name: /Editor LaTeX/ });
  await expect(editor).toBeVisible();
  await editor.locator(".monaco-editor .view-lines").click();
  await page.keyboard.type(" texto que colide", { delay: 60 });

  /*
   * `status` e não `alert`: o design system dá `role="alert"` só ao tom `danger`, que interrompe o
   * leitor de tela. Conflito é `warn` — ninguém perdeu nada, e a pessoa decide quando recarregar.
   * A distinção é do `Banner` e está certa; o seletor é que precisava respeitá-la.
   *
   * E pelo aviso, não por "Conflito" solto: o selo da barra de abas diz a mesma palavra.
   */
  const aviso = page.getByRole("status").filter({ hasText: "Conflito" });
  await expect(aviso).toBeVisible({ timeout: 15_000 });
  await expect(aviso).toContainText("O autosave está pausado até você recarregar.");

  await expect(aviso.getByRole("button", { name: "Tentar agora" })).toHaveCount(0);
});
