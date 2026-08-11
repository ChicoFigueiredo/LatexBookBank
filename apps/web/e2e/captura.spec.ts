import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * **O E2E de captura** (§42 do prompt do time).
 *
 * ```text
 * abrir livro → captura → fixture de imagem → crop → provider determinístico
 * → review → corrigir → criar questão → editor → reload → a origem continua ligada
 * ```
 *
 * O reconhecimento é interceptado, e isso é a exigência da §42 — **não usar modelo real em CI**.
 * Um E2E ligado ao modelo de visão seria lento, instável e só passaria na máquina de quem está com
 * o Ollama de pé; quer dizer, um E2E que ninguém roda. O provider de verdade é exercitado à parte.
 *
 * O que **não** é dublê: o upload, o recorte, a âncora, a criação da questão e a proveniência.
 * São eles que este teste existe para provar, e o defeito que ele fecha é o que a §2 lista como
 * inaceitável — copiar LaTeX entre telas internas do produto.
 *
 * O erro do OCR é **deliberado** (design §12): o candidato vem com `x^3` onde o recorte tem `x^2`.
 * O teste corrige antes de aceitar, e depois confere que a proveniência guardou os dois — o cru do
 * modelo e o que ficou no acervo. Sem isso, "o OCR errou ou eu digitei errado?" não tem resposta.
 */

// `__dirname` e não `import.meta.url`: o runner do Playwright carrega os specs como CommonJS, e
// `import.meta` ali é erro de sintaxe antes de qualquer teste rodar.
const FIXTURE = path.join(__dirname, "fixtures", "questao-sintetica.png");

/** O que o modelo teria respondido. Fixo, e com o erro de expoente de propósito. */
const CANDIDATO = {
  cropAssetId: "",
  result: {
    latex: "Calcule o valor de $x^3$ quando $x = 3$.",
    confidence: 0.55,
    alternatives: [],
    providerId: "e2e",
    model: "dublê-de-visão",
    durationMs: 42,
  },
  editedLatex: null,
  state: "candidate",
};

const CORRIGIDO = "Calcule o valor de $x^2$ quando $x = 3$.";

async function criarLivroVazio(page: Page, marca: string): Promise<string> {
  const biblioteca = await page.request.post("/api/libraries", {
    data: { name: `Acervo de captura ${marca}` },
  });
  expect(biblioteca.ok(), "não deu para criar a biblioteca").toBeTruthy();
  const { library } = (await biblioteca.json()) as { library: { id: string } };

  const livro = await page.request.post(`/api/libraries/${library.id}/publications`, {
    data: { title: `Livro de captura ${marca}` },
  });
  expect(livro.ok(), "não deu para cadastrar o livro").toBeTruthy();

  const { publication } = (await livro.json()) as { publication: { id: string } };
  return publication.id;
}

/** Arrasta um retângulo sobre a página desenhada — o gesto de recortar. */
async function recortar(page: Page): Promise<void> {
  const holder = page.locator(".lbb-pdf-holder");
  await expect(holder).toBeVisible();

  const caixa = await holder.boundingBox();
  expect(caixa, "o visualizador não mediu").toBeTruthy();
  if (!caixa) return;

  await page.mouse.move(caixa.x + caixa.width * 0.1, caixa.y + caixa.height * 0.15);
  await page.mouse.down();
  // Dois movimentos: um `move` só entre o `down` e o `up` produz um retângulo que alguns
  // navegadores tratam como clique.
  await page.mouse.move(caixa.x + caixa.width * 0.5, caixa.y + caixa.height * 0.4);
  await page.mouse.move(caixa.x + caixa.width * 0.85, caixa.y + caixa.height * 0.6);
  await page.mouse.up();

  await page.getByRole("button", { name: "Salvar recorte" }).click();
}

test("da imagem colada à questão com origem", async ({ page }) => {
  const marca = `${Date.now()}`;
  const publicationId = await criarLivroVazio(page, marca);

  // O reconhecimento é o único dublê. Ele responde o candidato fixo, com o `cropAssetId` que a
  // própria requisição trouxe — é assim que o recorte de verdade continua ligado ao candidato.
  await page.route("**/api/recognition", async (route) => {
    const corpo = route.request().postData() ?? "";
    const id = /name="cropAssetId"\r?\n\r?\n([^\r\n]+)/.exec(corpo)?.[1] ?? "";

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...CANDIDATO, cropAssetId: id }),
    });
  });

  await test.step("abrir a captura do livro e subir a fixture", async () => {
    await page.goto(`/publications/${publicationId}/ingestao`);

    await page.setInputFiles('input[type="file"]', FIXTURE);
    await expect(page.locator(".lbb-pdf-holder")).toBeVisible();
  });

  await test.step("escolher o modo, recortar e receber o candidato", async () => {
    // A escolha vem **antes** do recorte: ela muda o que se pede ao modelo, e descobrir a opção
    // só ao ver o resultado errado custa uma rodada do modelo de visão.
    await page.getByRole("button", { name: "Texto com fórmula" }).click();

    await recortar(page);

    await expect(page.getByLabel("LaTeX reconhecido")).toHaveValue(CANDIDATO.result.latex);
    // O recorte fica ao lado do candidato até o fim — sem a imagem à vista, a revisão que se pede
    // é impossível.
    await expect(page.getByAltText("Recorte da página")).toBeVisible();
    await expect(page.getByText(/confiança baixa/i)).toBeVisible();
  });

  await test.step("**a fila sobrevive ao recarregamento**", async () => {
    /**
     * O recorte é durável desde que foi salvo: `Asset` + `SourceAnchor`, gravados antes de o
     * reconhecimento acontecer. Fechar a aba no meio de dez capturas não pode custar as dez
     * (§26, §53), e é isso que este passo prova.
     *
     * O item aparece como **aguardando**, e não como "revisar", por causa do dublê: o
     * reconhecimento deste E2E é interceptado no navegador, então o servidor não chegou a rodar a
     * rota e não gravou transcrição nenhuma na âncora. Quem prova a gravação é o último passo,
     * sobre a proveniência — ali o caminho é real.
     */
    await page.reload();

    const fila = page.getByRole("region", { name: "Fila de captura" });
    await expect(fila).toBeVisible();
    await expect(fila.getByText("página 1")).toBeVisible();
    await expect(fila.getByAltText("Recorte da página 1")).toBeVisible();

    // E dá para retomar dali, sem chamar o modelo de novo.
    await fila.getByRole("button", { name: "Revisar" }).click();
    await expect(page.getByText("Conferido — falta dizer onde entra")).toBeVisible();
  });

  await test.step("descartar tira o recorte da fila", async () => {
    // Recorte rejeitado é seleção errada na página, não patrimônio — a **fonte** continua
    // intacta, e recortar de novo é sempre possível.
    const fila = page.getByRole("region", { name: "Fila de captura" });
    await fila.getByRole("button", { name: /Descartar recorte/ }).click();

    await expect(fila).toHaveCount(0);
  });

  await test.step("corrigir o erro do modelo antes de aceitar", async () => {
    // O recarregamento limpou o painel de captura — o arquivo estava só na memória do navegador,
    // e é assim mesmo: o que o produto promete guardar é o **recorte**, não a sessão de upload.
    await page.setInputFiles('input[type="file"]', FIXTURE);
    await page.getByRole("button", { name: "Texto com fórmula" }).click();
    await recortar(page);

    await expect(page.getByLabel("LaTeX reconhecido")).toHaveValue(CANDIDATO.result.latex);
    await page.getByLabel("LaTeX reconhecido").fill(CORRIGIDO);
    await page.getByRole("button", { name: "Conferi — usar este LaTeX" }).click();

    // Aceitar **não** cria nada: o reconhecimento não pode parecer que já mexeu no acervo.
    await expect(page.getByText("Conferido — falta dizer onde entra")).toBeVisible();
  });

  await test.step("criar a questão no destino escolhido", async () => {
    await page.getByLabel("Número no livro").fill("27");
    await page.getByRole("button", { name: "Criar questão" }).click();

    await expect(page.getByText("Questão criada")).toBeVisible();
    // O aviso de confiança baixa sobrevive à criação: ele descreve o que originou a questão.
    await expect(page.getByText(/Confiança baixa/)).toBeVisible();
  });

  await test.step("abrir no editor — o texto corrigido está lá", async () => {
    await page.getByRole("link", { name: "Abrir no editor" }).click();

    await expect(page.getByRole("heading", { name: "Questão 27" })).toBeVisible();
    await expect(page.getByRole("group", { name: /Editor LaTeX/ })).toContainText("x^2");
  });

  await test.step("recarregar — a origem continua ligada", async () => {
    await page.reload();
    await page.getByRole("tab", { name: "Origem" }).click();

    // Página, arquivo e recorte: é o que a §17 chama de aceite da proveniência.
    await expect(page.getByText("questao-sintetica.png")).toBeVisible();
    await expect(page.getByText(/página\s*1/i)).toBeVisible();
  });

  await test.step("a proveniência guarda o que o modelo leu, não só o que ficou", async () => {
    // É o que responde "o OCR errou ou eu digitei errado?" seis meses depois (§69). O acervo tem
    // `x^2`; a âncora guarda o `x^3` que o modelo propôs.
    const tree = await page.request.get(`/api/publications/${publicationId}/tree`);
    const { nodes } = (await tree.json()) as { nodes: { question: { id: string } | null }[] };
    const questionId = nodes.find((node) => node.question !== null)?.question?.id ?? "";

    const origem = await page.request.get(`/api/questions/${questionId}/origin`);
    const { provenance } = (await origem.json()) as {
      provenance: { sourceText: string; extractionModel: string };
    };

    expect(provenance.sourceText).toContain("x^3");
    expect(provenance.extractionModel).toBe("dublê-de-visão");
  });
});
