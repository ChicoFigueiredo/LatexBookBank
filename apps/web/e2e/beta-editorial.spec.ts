import { expect, test, type Page } from "@playwright/test";

/**
 * **O heartbeat do Beta Editorial** (§41 do prompt do time).
 *
 * Um teste, o caminho inteiro, num navegador de verdade:
 *
 * ```text
 * criar biblioteca → criar livro → abrir → criar capítulo → criar grupo
 * → criar escolha simples → editar → alternativas → marcar correta
 * → salvar → validar → recarregar → a persistência aguenta
 * ```
 *
 * O que ele tem a dizer e os testes de unidade não têm: **a sequência**. Cada peça é verificada
 * isolada; o que ninguém verificava é que criar uma biblioteca deixa o acervo pronto para receber
 * um livro, que o livro abre com a árvore vazia e os CTAs certos, e que a questão criada pelo menu
 * chega ao editor com as cinco alternativas já lá.
 *
 * Ele começa **do zero de propósito** — cria a própria biblioteca em vez de usar a do seed. É a
 * Definition of Done absoluta da §95: demonstrar com banco limpo, sem intervenção no banco, sem
 * mock, sem copiar e colar entre telas.
 *
 * O nome carrega o carimbo de tempo porque a suíte roda contra o banco de desenvolvimento, e uma
 * biblioteca de nome fixo colidiria com a da rodada anterior — que é o comportamento certo do
 * produto (nome duplicado é recusado) e o errado para um teste.
 */

const carimbo = () => `${Date.now()}`;

async function criarBiblioteca(page: Page, nome: string): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Criar biblioteca" }).first().click();

  const dialogo = page.getByRole("dialog");
  await expect(dialogo).toBeVisible();

  await dialogo.getByLabel("Nome").fill(nome);
  await dialogo.getByRole("button", { name: "Criar biblioteca" }).click();

  // A tela da biblioteca nova, e não um toast: criar biblioteca **leva** para ela, porque o passo
  // seguinte é sempre o primeiro livro.
  await expect(page.getByRole("heading", { name: nome })).toBeVisible();
}

async function cadastrarLivro(page: Page, titulo: string): Promise<void> {
  await page.getByRole("button", { name: "Adicionar primeiro livro" }).click();
  await page.getByRole("link", { name: "Cadastrar manualmente" }).click();

  await expect(page.getByRole("heading", { name: "Adicionar livro" })).toBeVisible();

  // **Só o título.** É a promessa do design §5: dá para começar com pouco e completar depois.
  await page.getByLabel("Título").fill(titulo);
  await page.getByRole("button", { name: "Cadastrar livro" }).click();

  await expect(page.getByRole("heading", { name: titulo })).toBeVisible();
}

/** O menu `+ Adicionar` do workbench — Estrutura e Questões, dois grupos rotulados. */
async function adicionar(page: Page, item: string): Promise<void> {
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

/**
 * Batiza o nó recém-criado.
 *
 * O nó de estrutura nasce **em renomeação**, com o campo focado e o texto selecionado — obrigar a
 * achá-lo depois para batizá-lo seria trabalho que a máquina pode poupar. Esperar o campo antes de
 * digitar é o que separa este teste de um `keyboard.type` que chega antes do input existir.
 */
async function batizar(page: Page, nome: string): Promise<void> {
  const campo = page.getByRole("tree").getByRole("textbox");
  await expect(campo).toBeFocused();

  await campo.fill(nome);
  await campo.press("Enter");

  // O nó recém-criado é o **selecionado**, e é por aí que ele se identifica sem ambiguidade: o
  // `hasText` do pai casa com o texto do filho, então filtrar por texto acharia os dois.
  await expect(page.getByRole("treeitem", { selected: true })).toContainText(nome);
}

test("do banco limpo à questão persistida, sem tocar no banco", async ({ page }) => {
  const marca = carimbo();
  const biblioteca = `Acervo E2E ${marca}`;
  const livro = `Livro do heartbeat ${marca}`;

  await test.step("criar biblioteca", async () => {
    await criarBiblioteca(page, biblioteca);
  });

  await test.step("cadastrar livro manualmente", async () => {
    await cadastrarLivro(page, livro);
  });

  await test.step("abrir o livro — vazio, com saída", async () => {
    await page.getByRole("link", { name: "Abrir no editor" }).click();

    // O empty state do design §6: não é constatação, é o começo do trabalho.
    await expect(page.getByText("Este livro ainda não tem estrutura")).toBeVisible();
    await expect(page.getByRole("button", { name: "Criar primeiro capítulo" })).toBeVisible();
  });

  await test.step("criar capítulo e grupo", async () => {
    await adicionar(page, "Capítulo");
    await batizar(page, "Capítulo 1");

    // O grupo entra **dentro** do capítulo: contêiner recebe dentro, folha recebe ao lado
    // (`placementForAdd`). Sem isso, ele nasceria irmão e a árvore ficaria plana.
    await adicionar(page, "Grupo de questões");
    await batizar(page, "Exercícios");
  });

  await test.step("criar uma escolha simples", async () => {
    await adicionar(page, "Escolha simples");

    // Questão criada é questão **inteira**: o editor abre porque existe `Question`, não só nó.
    await expect(page.getByRole("tab", { name: "Alternativas" })).toBeVisible();
  });

  await test.step("escrever o enunciado e deixar o autosave gravar", async () => {
    // A árvore recarrega depois de criar (`router.refresh`), e digitar durante o refresh manda
    // teclas para o campo que estiver focado quando ele terminar. Esperar a questão aparecer na
    // árvore é esperar o refresh acabar.
    await expect(page.getByRole("treeitem", { selected: true })).toContainText("Questão nova");

    const editor = page.locator(".monaco-editor").first();
    await editor.click();

    /**
     * `insertText` e não `type`.
     *
     * O Monaco reage a cada tecla — autocomplete de 652 snippets, fechamento de delimitador — e
     * teclas sintéticas a essa cadência chegam fora de ordem: `type("Quanto vale")` produzia
     * "Qantovle". Não é defeito do produto (ninguém digita a 40 caracteres por segundo) e o teste
     * não tem nada a dizer sobre isso; o que ele precisa provar é que o texto **que entra no
     * editor** chega ao banco. `insertText` entra pelo mesmo caminho de um `Ctrl+V`.
     */
    await page.keyboard.insertText("Quanto vale dois mais dois?");

    // O indicador, e não um `waitForTimeout`: o que importa é o estado ter chegado a "salvo".
    await expect(page.getByText("salvo", { exact: true })).toBeVisible({ timeout: 20_000 });
  });

  await test.step("preencher alternativas e marcar a correta", async () => {
    await page.getByRole("tab", { name: "Alternativas" }).click();

    // Pelo rótulo de cada alternativa, e não por posição na página: o filtro da árvore também é
    // um `textbox`, e `nth(0)` acabava sendo ele.
    await page.getByLabel("Texto da alternativa a").fill("3");
    await page.getByLabel("Texto da alternativa b").fill("4");

    // Escolha simples é **rádio**: marcar uma desmarca a outra. A identidade é da alternativa, não
    // da letra — marcar `b` marca a alternativa que hoje ocupa a segunda posição.
    const correta = page.getByRole("radio", { name: "Marcar b como correta" });
    await correta.click();
    await expect(correta).toHaveAttribute("aria-checked", "true");
  });

  await test.step("validar — e a lista diz o que falta, não só que falta", async () => {
    await page.getByRole("tab", { name: "Validação" }).click();
    await page.getByRole("button", { name: "Validar questão" }).click();

    await expect(page.getByText("Enunciado preenchido")).toBeVisible();
    await expect(page.getByText(/correta/)).toBeVisible();
  });

  await test.step("recarregar — nada se perde", async () => {
    const url = page.url();
    await page.reload();

    /**
     * A questão continua na árvore **e continua selecionada**, com o enunciado que virou o nome
     * dela. Pelo selecionado, e não por texto: o `li` do capítulo contém o texto do neto, então
     * um filtro por texto casaria com três linhas.
     *
     * A árvore também reabre o ramo sozinha: o nó guardado está dois níveis abaixo, e sem isso
     * ele voltaria selecionado e invisível.
     */
    await expect(page.getByRole("treeitem", { selected: true })).toContainText(
      "Quanto vale dois mais dois?",
    );
    await expect(page.getByRole("heading", { name: "Quanto vale dois mais dois?" })).toBeVisible();
    expect(page.url()).toBe(url);
  });

  await test.step("fechar, voltar pelo Início e reencontrar tudo", async () => {
    await page.goto("/");

    // "Continuar" é a primeira coisa da Home para quem já trabalha (design §19), e ele nomeia o
    // caminho inteiro — não só o livro.
    await expect(page.getByText("Continuar").first()).toBeVisible();
    await expect(page.getByText("Capítulo 1 › Exercícios")).toBeVisible();

    // A biblioteca aparece **duas vezes**: no cartão dela e no rodapé do livro recente. É o certo
    // — os dois respondem perguntas diferentes —, e o teste pega o cartão, que é o que navega.
    const cartao = page.getByRole("link", { name: new RegExp(biblioteca) }).first();
    await expect(cartao).toBeVisible();

    await cartao.click();
    await expect(page.getByRole("link", { name: new RegExp(livro) })).toBeVisible();
  });
});
