import { expect, test, type Page } from "@playwright/test";

import { abrirPrimeiraQuestao, acharQuestao } from "./acervo";

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
 * A publicação vem de `publicacaoComQuestao` e não da primeira da Home: com a Home real, e com os
 * livros que o próprio E2E do Beta cria, "a primeira" é quase sempre um livro vazio — e a espera
 * por uma questão estourava o timeout dizendo outra coisa.
 *
 * Ver spec §27 · issue #155.
 */
const primeiraPublicacao = async (page: Page): Promise<string> => {
  const { publicationId, nodeId } = await acharQuestao(page);
  // O `?node=` fica guardado no closure para os `goto` do próprio spec, que montam a URL à mão.
  alvo = nodeId;
  return publicationId;
};

/** O nó da questão da rodada. Preenchido por `primeiraPublicacao`. */
let alvo = "";

test.describe("o caminho da questão", () => {
  test("abrir, selecionar, editar, salvar e renderizar", async ({ page }) => {
    const publicationId = await primeiraPublicacao(page);
    expect(publicationId).not.toBe("");

    // ── abrir publicação ────────────────────────────────────────────────
    await page.goto(`/publications/${publicationId}?node=${alvo}`);
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
    // `Control+End` e não `End`: o clique cai onde o ponteiro estiver, e `End` iria ao fim
    // **daquela** linha — num enunciado de várias linhas isso escreveria no meio do texto.
    await page.keyboard.press("Control+End");

    // Sem espaço dentro da marca: `toContainText` normaliza espaços, e o Monaco reescreve alguns
    // ao digitar — a comparação falharia por um espaço, não pelo que o teste quer afirmar.
    const marca = `%e2e-${Date.now()}`;
    // `delay` porque o `type()` sem intervalo dispara as teclas mais rápido do que o Monaco
    // processa, e o editor **perde caracteres** — o que chegava ao banco era `%e2e2613` no lugar
    // de `%e2e-1786434226913`. Apareceu quando o worker do editor passou a carregar (#183): o
    // editor ficou mais pesado por estar completo. Ninguém digita sem intervalo; o teste também
    // não deve.
    await page.keyboard.type(` ${marca}`, { delay: 60 });

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
    // `Control+End`: o clique cai onde o ponteiro estiver, e `End` iria ao fim **daquela** linha.
    // Num enunciado de várias linhas os backspaces comeriam o texto de alguém — aconteceu.
    await page.keyboard.press("Control+End");
    // +1 pelo espaço que separou a marca do enunciado.
    for (let i = 0; i < marca.length + 1; i += 1) await page.keyboard.press("Backspace");

    await expect(page.getByText("salvo", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(recarregado).not.toContainText("e2e");
  });

  /**
   * O teste que achou a #156 — e que agora a afirma corrigida.
   *
   * Compilar uma questão cujo fonte mudou mas cuja **saída é idêntica** — acrescentar um
   * comentário LaTeX basta — cria um job novo apontando para bytes que já existem. Com
   * `Asset.storageKey @unique`, a gravação caía com 500 e a tela dizia "Falha ao compilar", que
   * era mentira: a compilação tinha dado certo.
   *
   * Ficou `fixme` por uma sessão inteira em vez de ser apagado, porque um teste removido leva o
   * achado junto.
   */
  test("render compila e o resultado aparece na tela", async ({ page }) => {
    const publicationId = await primeiraPublicacao(page);

    await page.goto(`/publications/${publicationId}?node=${alvo}`);
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

    // ── e agora a #156, que é o motivo de este teste existir ────────────
    // Um comentário LaTeX numa linha só: o fonte muda (o cache não pega, um job novo nasce) e o
    // PDF sai **byte a byte igual**, porque comentário não vira tinta. Era aqui que a segunda
    // compilação batia em `Asset.storageKey @unique` e devolvia 500.
    const editor = page.getByRole("group", { name: /Editor LaTeX/ });
    await editor.locator(".monaco-editor .view-lines").click();
    // `Control+End` e não `End`: o clique cai onde o ponteiro estiver, e `End` iria só ao fim
    // **daquela** linha. Numa questão de várias linhas isso escreveria no meio do enunciado — e
    // foi exatamente o que a primeira versão deste teste fez com o acervo de demonstração.
    await page.keyboard.press("Control+End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("%e2e-comentario");

    await expect(page.getByText("salvo", { exact: true })).toBeVisible({ timeout: 15_000 });

    await page.getByRole("tab", { name: "PDF compilado" }).click();
    await page
      .getByRole("button", { name: /Compilar/i })
      .first()
      .click();

    await expect(pronto.or(indisponivel)).toBeVisible({ timeout: 45_000 });
    // A afirmação que importa: **nunca** "Falha ao compilar". É o texto que a tela mostrava para
    // uma compilação bem-sucedida, e é a mentira que a #156 corrigiu.
    await expect(page.getByText("Falha ao compilar")).toHaveCount(0);

    // E desfaz, para não deixar resíduo no acervo de demonstração.
    //
    // Selecionar a linha inteira em vez de contar backspaces: contar depende de o cursor estar
    // onde se imagina, e quando não está o teste apaga o enunciado de alguém. Aqui a seleção é
    // `Control+End` → `Shift+Home` (a última linha inteira), e o `Backspace` final leva a quebra
    // de linha que a criou.
    const atual = page.getByRole("group", { name: /Editor LaTeX/ });
    await atual.locator(".monaco-editor .view-lines").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.press("Shift+Home");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");

    await expect(page.getByText("salvo", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(atual).not.toContainText("e2e-comentario");
  });

  test("dá para continuar digitando enquanto o render roda", async ({ page }) => {
    // É o aceite "render autoritativo nunca trava a edição". A compilação acontece na requisição,
    // então o risco real é a tela ficar refém dela — e isso não aparece em teste de unidade,
    // porque lá não existe um editor para travar.
    const publicationId = await primeiraPublicacao(page);

    await page.goto(`/publications/${publicationId}?node=${alvo}`);
    await abrirPrimeiraQuestao(page);

    // O render fica pendurado de propósito: se a edição depende dele, é agora que trava.
    await page.route("**/questions/*/render", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 8_000));
      await route.fulfill({ status: 503, json: { message: "worker fora do ar" } });
    });

    await page.getByRole("tab", { name: "PDF compilado" }).click();
    await page
      .getByRole("button", { name: /Compilar/i })
      .first()
      .click();

    const editor = page.getByRole("group", { name: /Editor LaTeX/ });
    await editor.locator(".monaco-editor .view-lines").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" x", { delay: 60 });

    // Digitou **enquanto** a compilação estava em curso.
    await expect(page.getByText("não salvo", { exact: true })).toBeVisible({ timeout: 5_000 });

    // E desfaz, para não deixar resíduo.
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await expect(page.getByText("salvo", { exact: true })).toBeVisible({ timeout: 15_000 });
  });

  test("o preview rápido aparece sem passar pelo servidor", async ({ page }) => {
    const publicationId = await primeiraPublicacao(page);

    await page.goto(`/publications/${publicationId}?node=${alvo}`);
    await abrirPrimeiraQuestao(page);

    // O aviso é permanente e é parte do contrato com quem lê: preview rápido **pode** diferir.
    await expect(page.getByText(/pode diferir do PDF final/i)).toBeVisible();
  });

  test("a tela da questão não lança erro não tratado", async ({ page }) => {
    /**
     * O guarda que faltava (#183).
     *
     * O Monaco tentava criar o worker a partir de uma URL que o Turbopack reescreve, e a página
     * estourava um `TypeError` **não tratado** já no carregamento:
     *
     *   Failed to resolve module specifier
     *     '/_next/static/media/editorWebWorkerMain.<hash>.js#editorWorkerService'
     *
     * Nada visível quebrava — o editor abria e aceitava texto —, e é o que tornava o defeito ruim:
     * quem abre o console vê vermelho na tela principal e não tem como saber se o produto está de
     * pé. Doze testes de E2E passavam por cima dele, porque nenhum olhava o console.
     */
    const erros: string[] = [];
    page.on("pageerror", (error) => erros.push(String(error)));

    const publicationId = await primeiraPublicacao(page);
    await page.goto(`/publications/${publicationId}?node=${alvo}`);
    await abrirPrimeiraQuestao(page);

    const editor = page.getByRole("group", { name: /Editor LaTeX/ });
    await expect(editor).toBeVisible();
    // Um instante para o Monaco terminar de subir: o erro do worker acontecia **depois** de o
    // editor aparecer, e um teste que só esperasse o elemento passaria por cima.
    await editor.locator(".monaco-editor .view-lines").click();
    await page.waitForTimeout(2_000);

    expect(erros, erros.join(" | ")).toEqual([]);
  });
});
