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

/**
 * **A espera do reconhecimento presta contas** (protótipo, 1590–1614).
 *
 * A tela dizia `reconhecendo…` — uma palavra num canto — durante a única espera do produto em que
 * o usuário tem uma pergunta concreta na cabeça: *"se isto falhar, perco meu recorte?"*.
 *
 * A resposta é **não**, e sempre foi: o `cropAssetId` nasce antes de o modelo ser chamado, e o
 * `catch` devolve um candidato vazio justamente para a transcrição à mão continuar possível. A
 * garantia estava no código e até no comentário — e nunca chegava a quem esperava.
 *
 * O teste segura a resposta do reconhecedor para que a espera exista o tempo suficiente de ser
 * olhada. Sem isso, o bloco existiria por dois frames e nenhum teste o veria.
 */
test("enquanto o modelo lê, a tela diz o que já está garantido", async ({ page }) => {
  const marca = `${Date.now()}`;
  const publicationId = await criarLivroVazio(page, marca);

  // Inicializado com um no-op, e não com `null`: o TypeScript não enxerga a atribuição feita
  // dentro do callback do `Promise` e estreita o tipo para `null`, tornando a chamada inválida.
  let liberar: () => void = () => {};
  const presa = new Promise<void>((resolve) => {
    liberar = resolve;
  });

  await page.route("**/api/recognition", async (route) => {
    const corpo = route.request().postData() ?? "";
    const id = /name="cropAssetId"\r?\n\r?\n([^\r\n]+)/.exec(corpo)?.[1] ?? "";

    // Segura até o teste ter conferido a espera. É o que torna um estado transitório observável.
    await presa;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...CANDIDATO, cropAssetId: id }),
    });
  });

  await page.goto(`/publications/${publicationId}/ingestao`);
  await page.setInputFiles('input[type="file"]', FIXTURE);
  await expect(page.locator(".lbb-pdf-holder")).toBeVisible();

  await recortar(page);

  const espera = page.locator(".lbb-ing-progress");
  await expect(espera).toBeVisible();

  // O passo já consumado, e o que está acontecendo agora. O primeiro é um fato no momento em que
  // aparece — não uma barra de progresso fingida.
  await expect(espera).toContainText("recorte guardado como evidência");
  await expect(espera).toContainText("lendo texto e matemática");

  // E a frase que responde a pergunta de quem espera, durante a espera.
  await expect(espera).toContainText(
    "se o reconhecimento falhar, o recorte fica — dá para transcrever à mão",
  );

  liberar();

  // Terminada a leitura, a prestação de contas sai: ela é da espera, e a espera acabou.
  await expect(page.getByLabel("LaTeX reconhecido")).toHaveValue(CANDIDATO.result.latex);
  await expect(espera).toHaveCount(0);
});

/**
 * **Questão completa** — o modo que o handoff listou como faltando.
 *
 * *"Reconhecimento tinha 3 modos técnicos (display/mixed/text); faltava Questão completa."* E a
 * lacuna era mais funda que a frase: `RecognitionCandidate` tem `options`,
 * `createQuestionFromRecognition` sabe gravá-las, a rota `from-recognition` já as aceitava — e
 * **nada no app jamais as preencheu**. A ponta receptora estava pronta e ninguém alimentava.
 *
 * O que faltava entre "o modelo leu a página" e "a questão existe com cinco alternativas" não era
 * modelo: era a separação, que é problema de texto e agora tem regra explícita e testada.
 *
 * A separação é **mostrada antes de gravar**, e este teste guarda isso: é o princípio do módulo —
 * nenhum caminho leva de "o modelo leu" a "está no acervo" sem um humano ver. Cinco alternativas
 * criadas em silêncio só apareceriam na prova impressa.
 */
test("“Questão completa” separa as alternativas, mostra a separação, e grava as duas partes", async ({
  page,
}) => {
  const marca = `${Date.now()}`;
  const publicationId = await criarLivroVazio(page, marca);

  const LIDO = [
    `Um capital de R\\$ 5.000,00 rende a 2\\% ao mês. Qual o montante? ${marca}`,
    "a) R\\$ 5.612,25",
    "b) R\\$ 6.341,21",
    "c) R\\$ 6.529,67",
  ].join("\n");

  await page.route("**/api/recognition", async (route) => {
    const corpo = route.request().postData() ?? "";
    const id = /name="cropAssetId"\r?\n\r?\n([^\r\n]+)/.exec(corpo)?.[1] ?? "";

    // O modo que chega ao provider é `mixed`: `questao` é nosso, e a diferença está no que se faz
    // com o que ele devolveu — não no que se pede a ele.
    expect(corpo).toContain("mixed");

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        cropAssetId: id,
        editedLatex: null,
        state: "candidate",
        result: {
          latex: LIDO,
          confidence: 0.91,
          alternatives: [],
          providerId: "fake",
          model: "fake-vision",
          durationMs: 10,
        },
      }),
    });
  });

  await page.goto(`/publications/${publicationId}/ingestao`);
  await page.setInputFiles('input[type="file"]', FIXTURE);
  await expect(page.locator(".lbb-pdf-holder")).toBeVisible();

  await page.getByRole("button", { name: "Questão completa" }).click();
  await recortar(page);

  await test.step("a separação aparece antes de qualquer gravação", async () => {
    const split = page.locator(".lbb-ing-split");
    await expect(split).toBeVisible();
    await expect(split).toContainText("3 alternativas separadas do enunciado");

    // E a tela diz o que **não** faz: adivinhar o gabarito. Uma correta marcada por engano passa
    // por revisada, que é o erro caro.
    await expect(split).toContainText("nenhuma nasce marcada como correta");
    await expect(split.locator(".lbb-ing-alt")).toHaveCount(3);
  });

  await test.step("aceitar grava enunciado e alternativas, sem repetir o bloco", async () => {
    await page.getByRole("button", { name: "Conferi — usar este LaTeX" }).click();
    await page.getByRole("button", { name: /Criar questão/ }).click();

    await expect(page.getByText(/Questão criada/i)).toBeVisible({ timeout: 20_000 });

    const tree = await page.request.get(`/api/publications/${publicationId}/tree`);
    const { nodes } = (await tree.json()) as {
      nodes: {
        question: { statementLatex: string; options: { statementLatex: string }[] } | null;
      }[];
    };

    const criada = nodes.find((node) => node.question !== null)?.question;
    expect(criada?.options).toHaveLength(3);

    // O enunciado ficou **sem** as alternativas: deixá-las nos dois lugares imprimiria o bloco de
    // opções duas vezes na mesma questão.
    expect(criada?.statementLatex).toContain(marca);
    expect(criada?.statementLatex).not.toContain("5.612,25");
  });
});

/**
 * **Duas alternativas coladas num bloco** — o caso `ocrMerged` do protótipo (1702–1712).
 *
 * Acontece de verdade: página em duas colunas, e o OCR devolve `b) … c) …` na mesma linha. A regra
 * que protege o enunciado — âncora no início da linha — é justamente a que produz o bloco unido.
 *
 * A resposta não é dividir sozinho. Um `c)` no meio de uma alternativa pode ser parte do texto, e
 * dividir por conta própria criaria uma alternativa inventada com cara de revisada. Perguntar custa
 * um clique; errar custa uma prova impressa com a alternativa errada.
 */
test("bloco com duas alternativas é sinalizado, e a divisão é um gesto — não um palpite", async ({
  page,
}) => {
  const marca = `${Date.now()}`;
  const publicationId = await criarLivroVazio(page, marca);

  // O `c)` colado no fim do `b)`, que é exatamente o que a página de duas colunas produz.
  const LIDO = [
    `Quanto rende o capital? ${marca}`,
    "a) R\\$ 5.612,25",
    "b) R\\$ 6.341,21 c) R\\$ 6.529,67",
    "d) R\\$ 6.712,10",
  ].join("\n");

  await page.route("**/api/recognition", async (route) => {
    const corpo = route.request().postData() ?? "";
    const id = /name="cropAssetId"\r?\n\r?\n([^\r\n]+)/.exec(corpo)?.[1] ?? "";

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        cropAssetId: id,
        editedLatex: null,
        state: "candidate",
        result: {
          latex: LIDO,
          confidence: 0.88,
          alternatives: [],
          providerId: "fake",
          model: "fake-vision",
          durationMs: 10,
        },
      }),
    });
  });

  await page.goto(`/publications/${publicationId}/ingestao`);
  await page.setInputFiles('input[type="file"]', FIXTURE);
  await expect(page.locator(".lbb-pdf-holder")).toBeVisible();

  await page.getByRole("button", { name: "Questão completa" }).click();
  await recortar(page);

  const split = page.locator(".lbb-ing-split");
  await expect(split).toBeVisible();

  await test.step("o bloco unido aparece em aviso, e nada foi dividido sozinho", async () => {
    /*
     * **Duas** alternativas, e não quatro. O bloco unido quebra a sequência: com o `c)` colado
     * dentro do `b)`, o que a lista tem é `a` e `b` — e o `d)` seguinte, que não sucede `b`, cai
     * dentro do `b` junto com o resto.
     *
     * É consequência direta da regra de sequência consecutiva, e é o comportamento certo: o
     * separador não inventa uma sequência que o texto não tem. O que ele faz é **mostrar** o
     * problema onde ele está.
     */
    await expect(split.locator(".lbb-ing-alt")).toHaveCount(2);
    await expect(split.getByText("duas alternativas em um bloco")).toBeVisible();
    await expect(split.locator('.lbb-ing-alt[data-tone="warn"]')).toHaveCount(1);
  });

  await test.step("a divisão cascateia: cada corte revela o próximo", async () => {
    // Cortar `b` em `b` + `c` deixa o `d)` dentro do `c` — e o aviso reaparece ali. A pessoa
    // desfaz o estrago do OCR um corte por vez, vendo cada um.
    await split.getByRole("button", { name: "Dividir em duas" }).click();
    await expect(split.locator(".lbb-ing-alt")).toHaveCount(3);
    await expect(split.getByText("duas alternativas em um bloco")).toBeVisible();

    await split.getByRole("button", { name: "Dividir em duas" }).click();
    await expect(split.locator(".lbb-ing-alt")).toHaveCount(4);
    await expect(split.getByText("duas alternativas em um bloco")).toHaveCount(0);
    await expect(split).toContainText("4 alternativas separadas do enunciado");
  });

  await test.step("e o resultado é o que vai para o banco", async () => {

    await page.getByRole("button", { name: "Conferi — usar este LaTeX" }).click();
    await page.getByRole("button", { name: /Criar questão/ }).click();
    await expect(page.getByText(/Questão criada/i)).toBeVisible({ timeout: 20_000 });

    const tree = await page.request.get(`/api/publications/${publicationId}/tree`);
    const { nodes } = (await tree.json()) as {
      nodes: { question: { options: { label: string; statementLatex: string }[] } | null }[];
    };

    const criada = nodes.find((node) => node.question !== null)?.question;
    expect(criada?.options).toHaveLength(4);
    expect(criada?.options.map((o) => o.statementLatex.trim())).toContain("R\\$ 6.529,67");
  });
});
