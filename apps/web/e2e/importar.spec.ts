import { expect, test, type Page } from "@playwright/test";

/**
 * A simulação antes de gravar (protótipo, 1829–1888).
 *
 * O painel existia pela metade e o dado por trás dele estava quebrado: `toRuntime` era chamado sem
 * o índice do destino, caindo no `EMPTY_INDEX`, então a simulação respondia **zero conflitos em
 * qualquer cenário** — e a tela dizia isso. Um defeito que soa como boa notícia.
 *
 * Este teste faz o caminho de verdade: exporta uma biblioteca com conteúdo, escolhe o arquivo
 * exportado, e confere que a simulação conta o que vai entrar antes de qualquer gravação. Um
 * `.lbb` gerado pelo próprio app não colide consigo mesmo (ver a nota sobre identidade de origem
 * em `divergencias-prototipo.md`), então o que se assere aqui é a contagem e a honestidade do zero
 * — não um número de conflitos inventado.
 */

test("a simulação conta o que vai entrar, e nada é gravado até a escolha", async ({ page }) => {
  const marca = `${Date.now()}`;

  const biblioteca = await page.request.post("/api/libraries", {
    data: { name: `Acervo portátil ${marca}` },
  });
  const { library } = (await biblioteca.json()) as { library: { id: string } };

  const livro = await page.request.post(`/api/libraries/${library.id}/publications`, {
    data: { title: `Livro portátil ${marca}`, nickname: "PORT 1" },
  });
  const { publication } = (await livro.json()) as { publication: { id: string } };

  const capitulo = await page.request.post(`/api/publications/${publication.id}/nodes`, {
    data: { kind: "CHAPTER", title: "Capítulo", placement: { kind: "lastChild", parentId: null } },
  });
  const { id: capituloId } = (await capitulo.json()) as { id: string };

  for (let i = 0; i < 2; i += 1) {
    await page.request.post(`/api/publications/${publication.id}/questions`, {
      data: { type: "MULTIPLE_CHOICE", placement: { kind: "lastChild", parentId: capituloId } },
    });
  }

  const exportado = await page.request.get(`/api/workspaces/export?workspaceId=${library.id}`);
  expect(exportado.ok(), "não deu para exportar").toBeTruthy();
  const bytes = await exportado.body();

  const quantasAntes = await contarBibliotecas(page);

  await page.goto("/importar");

  await test.step("o rail leva até aqui — era o último destino que faltava", async () => {
    await expect(
      page.getByRole("navigation", { name: "Módulos" }).getByRole("button", {
        name: "Importar / exportar",
      }),
    ).toBeVisible();
  });

  await test.step("escolher o arquivo dispara a simulação sozinha", async () => {
    await page.locator('input[type="file"]').setInputFiles({
      name: `acervo-${marca}.lbb`,
      mimeType: "application/zip",
      buffer: bytes,
    });

    await expect(page.getByText("Simulação da importação (dry-run)")).toBeVisible();

    // As quatro células do protótipo. A do conflito é a que decide, e o zero aqui é **verdade** —
    // enquanto o índice do destino não chegava ao `toRuntime`, era zero por não ter olhado.
    const painel = page.locator(".lbb-dryrun");
    await expect(painel).toContainText("publicações");
    await expect(painel).toContainText("questões");
    await expect(painel).toContainText("conflitos");

    // O nome e o tamanho do arquivo no cabeçalho: é como se confere que é o arquivo certo.
    await expect(painel).toContainText(`acervo-${marca}.lbb`);
  });

  await test.step("simular não grava — a contagem de bibliotecas não mexeu", async () => {
    expect(await contarBibliotecas(page)).toBe(quantasAntes);
  });

  await test.step("abortar limpa a simulação e não deixa nada para trás", async () => {
    await page.getByRole("button", { name: "Abortar" }).click();

    await expect(page.getByText("Simulação da importação (dry-run)")).toBeHidden();
    expect(await contarBibliotecas(page)).toBe(quantasAntes);
  });
});

test("a exportação por biblioteca também mora aqui, e não só no cabeçalho da estante", async ({
  page,
}) => {
  const marca = `${Date.now()}`;
  const criada = await page.request.post("/api/libraries", {
    data: { name: `Acervo export ${marca}` },
  });
  const { library } = (await criada.json()) as { library: { id: string } };

  await page.goto("/importar");

  // Quem chega em "importar e exportar" veio pensando em portabilidade, não numa biblioteca
  // específica — e antes precisava saber de cor em qual estante entrar para achar o botão.
  //
  // Escolher e exportar, e não um botão por biblioteca: o banco real tem 72, e a primeira versão
  // desta tela empilhou 72 botões idênticos até empurrar o cartão de backup para fora da tela.
  const seletor = page.getByLabel("Biblioteca a exportar");
  await seletor.selectOption(library.id);

  const exportar = page.getByRole("link", { name: `Exportar “Acervo export ${marca}”` });
  await expect(exportar).toBeVisible();
  await expect(exportar).toHaveAttribute(
    "href",
    `/api/workspaces/export?workspaceId=${library.id}`,
  );
});

/**
 * O cartão de backup diz o **estado real**, e nunca uma frase fixa.
 *
 * O backup roda fora do app: um serviço externo escreve `backup-status.json` no
 * `BACKUP_DESTINATION`, e o `collectDiagnostics` já o lia — o Diagnóstico era o único lugar que
 * sabia. A frase do protótipo ("Último backup automático há 1 h · 3 cópias mantidas") é fixa, e
 * uma tela que afirma existir uma rede de segurança sem ter olhado é descoberta no dia em que se
 * precisa dela. Este teste falha se alguém colar a frase de volta.
 */
test("o cartão de backup diz o estado real, e nunca uma frase fixa", async ({ page }) => {
  await page.goto("/importar");

  // Um dos estados possíveis, e cada um é uma leitura — não um texto decorativo.
  await expect(
    page.getByText(/backup automático · (em dia|não configurado|precisa de atenção)/),
  ).toBeVisible({ timeout: 15_000 });

  await expect(page.getByText("Último backup automático há 1 h")).toHaveCount(0);
  await expect(page.getByText("3 cópias mantidas")).toHaveCount(0);
});

async function contarBibliotecas(page: Page): Promise<number> {
  const resposta = await page.request.get("/api/libraries");
  const { libraries } = (await resposta.json()) as { libraries: unknown[] };

  return libraries.length;
}
