import { expect, test } from "@playwright/test";

/**
 * As três últimas divergências: contagens do rail (§5), infraestrutura viva na barra (§9) e o
 * rodapé da busca (§10).
 *
 * As três têm o mesmo formato de defeito e por isso vêm juntas: o produto **sabia** a informação e
 * não a dizia. `WorkbenchModule` aceitava `badge` e ninguém passava um; `collectDiagnostics`
 * media worker e modelo e só a página de Diagnóstico via; a paleta filtrava por enunciado e
 * apelido e não contava a ninguém o que olhava.
 */

test("o rail conta o acervo, e só a fila de captura ganha o tom de aviso", async ({ page }) => {
  const marca = `${Date.now()}`;
  await page.request.post("/api/libraries", { data: { name: `Acervo rail ${marca}` } });

  await page.goto("/bibliotecas");

  const rail = page.getByRole("navigation", { name: "Módulos" });
  const bibliotecas = rail.getByRole("button", { name: /^Bibliotecas/ });

  // A contagem entra no nome acessível do botão — é assim que ela existe para quem não a vê.
  await expect(bibliotecas).toContainText(/\d/);

  await test.step("zero não vira badge — o rail está em toda tela e ruído aqui se paga sempre", async () => {
    // `Avaliações` não tem contagem nenhuma no protótipo nem aqui: o botão é só o rótulo.
    const avaliacoes = rail.getByRole("button", { name: "Avaliações" });
    await expect(avaliacoes).toHaveText("Avaliações");
  });
});

test("a barra de status diz a infraestrutura viva, e diz “verificando” antes de saber", async ({
  page,
}) => {
  await page.goto("/");

  const barra = page.getByRole("contentinfo", { name: "Barra de status" });

  // `local-first` vem do servidor e está lá desde o primeiro byte — é fato, não sonda.
  await expect(barra).toContainText("local-first");

  // E aparece **uma** vez: a primeira versão o pôs no `AppShell` sem tirar das telas, e a barra
  // saiu com "local-first · SQLite   SQLite · local" — a mesma coisa dita duas vezes, de dois
  // jeitos, que é como um rodapé passa a ser ignorado.
  expect((await barra.innerText()).match(/SQLite/g) ?? []).toHaveLength(1);

  // O resto chega depois: `probeRenderer` bate na rede, e pendurar isso no servidor faria toda
  // navegação esperar. Enquanto não chega, a barra diz o que é verdade.
  await expect(barra).toContainText(/render:|verificando/);
  await expect(barra).toContainText("render:", { timeout: 15_000 });
  await expect(barra).toContainText("ia:");
  await expect(barra).toContainText("backup:");
});

test("o rodapé da busca mostra os atalhos e o escopo verdadeiro", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Control+k");

  const paleta = page.getByRole("dialog");
  await expect(paleta).toBeVisible();

  for (const atalho of ["↑↓ navegar", "⏎ abrir no lugar certo", "⇧⏎ abrir em nova aba"]) {
    await expect(paleta).toContainText(atalho);
  }

  /*
   * O escopo é o que o app **faz**, e não o que o protótipo desenha.
   *
   * O protótipo escreve "busca no enunciado, tags, banca e ano". A busca livre olha enunciado e
   * apelido; tag, banca e ano são filtros estruturados, não texto livre. Prometer o que ela não
   * faz manda procurar defeito na busca quando o resultado vazio é o correto.
   */
  await expect(paleta).toContainText("busca no enunciado e no apelido");
  await expect(paleta).toContainText("tag, banca e ano são filtros");
});

/**
 * **O resultado da busca diz de que livro é** (protótipo, 2190).
 *
 * A palete devolvia título e, na linha de baixo, banca e ano. Com 1.247 questões em 24 livros — o
 * tamanho declarado do acervo —, quem busca "juros" recebe seis enunciados parecidos, e a pergunta
 * é **de qual livro é este**. Banca não responde; e banca e ano continuam existindo onde servem,
 * que é como filtro da busca avançada.
 */
test("o resultado da busca diz onde a questão mora", async ({ page }) => {
  const marca = `${Date.now()}`;
  const termo = `juroscomposto${marca}`;

  const biblioteca = await page.request.post("/api/libraries", {
    data: { name: `Acervo busca ${marca}` },
  });
  const { library } = (await biblioteca.json()) as { library: { id: string } };

  const livro = await page.request.post(`/api/libraries/${library.id}/publications`, {
    // Com apelido: é ele que aparece no caminho, porque é ele que distingue volumes da mesma
    // coleção numa lista de resultados.
    data: { title: `Fundamentos de Matemática ${marca}`, nickname: `FME ${marca}` },
  });
  const { publication } = (await livro.json()) as { publication: { id: string } };

  const capitulo = await page.request.post(`/api/publications/${publication.id}/nodes`, {
    data: {
      kind: "CHAPTER",
      title: "Exercícios propostos",
      placement: { kind: "lastChild", parentId: null },
    },
  });
  const { id: capituloId } = (await capitulo.json()) as { id: string };

  const questao = await page.request.post(`/api/publications/${publication.id}/questions`, {
    data: { type: "MULTIPLE_CHOICE", placement: { kind: "lastChild", parentId: capituloId } },
  });
  expect(questao.ok(), "não deu para criar a questão").toBeTruthy();

  // O id e a versão vêm da **árvore**, e não da resposta do POST: a forma daquela resposta já
  // enganou outros specs deste diretório, e a árvore é o contrato que a própria tela consome.
  const arvore = await page.request.get(`/api/publications/${publication.id}/tree`);
  const { nodes } = (await arvore.json()) as {
    nodes: { question: { id: string; version: string } | null }[];
  };
  const alvo = nodes.find((node) => node.question !== null)?.question;
  expect(alvo, "a questão precisa estar na árvore").toBeTruthy();

  const questionId = alvo?.id ?? "";
  const version = alvo?.version;

  // O termo entra no enunciado, que é onde a busca livre olha. A resposta é conferida: um PATCH
  // recusado em silêncio faria este teste falhar lá na frente, medindo a busca por um texto que
  // nunca chegou ao banco.
  const gravado = await page.request.patch(
    `/api/publications/${publication.id}/questions/${questionId}`,
    {
      data: {
        ...(version ? { expectedVersion: version } : {}),
        statementLatex: `Calcule o montante em ${termo}.`,
      },
    },
  );
  expect(gravado.ok(), `PATCH recusado: ${await gravado.text()}`).toBeTruthy();

  await page.goto("/");
  await page.keyboard.press("Control+k");

  const paleta = page.getByRole("dialog");
  await expect(paleta).toBeVisible();

  // `combobox`, e não `textbox`: o campo da palete declara `role="combobox"` com
  // `aria-controls` para a lista — é o papel certo, e o seletor é que precisava respeitá-lo.
  await paleta.getByRole("combobox").fill(termo);

  const resultado = paleta.getByRole("option").first();
  await expect(resultado).toBeVisible({ timeout: 15_000 });

  // O caminho: livro (pelo apelido) e o pai imediato.
  await expect(resultado).toContainText(`FME ${marca} › Exercícios propostos`);
});
