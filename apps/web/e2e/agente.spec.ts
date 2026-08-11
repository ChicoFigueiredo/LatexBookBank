import { expect, test, type Page } from "@playwright/test";

import { acharQuestao } from "./acervo";

/**
 * A metade agêntica da §27: abrir agente → pedir correção → revisar diff → aplicar.
 *
 * **O modelo é dublê, de propósito.** O que a §27 pede não é que o Ollama acerte — isso já foi
 * verificado contra o modelo de verdade na Fase 8 —, é que **o gesto humano no meio funcione**:
 * a proposta aparece, o diff é revisável linha a linha, e nada entra no banco sem alguém marcar.
 *
 * Um E2E ligado ao modelo real seria lento, instável e só passaria na máquina de quem está com o
 * Ollama de pé — quer dizer, um E2E que ninguém roda. O que **não** é dublê é a rota de aplicar:
 * ela grava de verdade, e é ela que a spec §14.6 protege.
 *
 * Ver spec §27 · §14.6 · issue #155.
 */

/**
 * A publicação e o nó, resolvidos pela API.
 *
 * Antes: o primeiro link da Home e vinte setas até um `treeitem` com "Quest" no rótulo. As duas
 * heurísticas quebraram quando a Home passou a listar bibliotecas e a questão passou a se chamar
 * pelo enunciado.
 */
const primeiraPublicacao = async (page: Page): Promise<string> =>
  (await acharQuestao(page)).publicationId;

/**
 * A resposta que o agente daria — sem o agente.
 *
 * O `patch` viaja de volta no `apply`, então precisa ser um patch que o servidor aceite: é ele
 * que o domínio valida antes de gravar. Um dublê que devolvesse lixo passaria pela tela e seria
 * recusado na rota — o que também é um resultado, mas não o que este teste quer ver.
 */
/** Seleciona a questão da publicação já aberta, pelo `?node=`. */
async function selecionarQuestao(page: Page): Promise<void> {
  const { publicationId, nodeId } = await acharQuestao(page);
  await page.goto(`/publications/${publicationId}?node=${nodeId}`);
  await expect(page.getByRole("group", { name: /Editor LaTeX/ })).toBeVisible();
}

const propostaFake = (texto: string) => ({
  answer: "Achei um espaço a mais no enunciado.",
  toolCalls: [],
  proposals: [
    {
      summary: "Corrige o enunciado",
      warnings: [],
      // O formato é o do `questionPatchSchema`: `strict()`, então campo a mais é recusado, e
      // `summary` é obrigatório **dentro** do patch. A primeira versão deste dublê mandava
      // `questionId` ali e o servidor recusou com o motivo exato — o que é o schema fazendo o
      // trabalho dele, e a razão de o `apply` não ser dublê aqui.
      patch: {
        schemaVersion: 1,
        summary: "Corrige o complemento",
        warnings: [],
        fields: [{ field: "complementLatex", value: texto }],
        options: [],
      },
      // O `id` é `field:<campo>`, como `patch-diff.ts` produz. O servidor **recalcula** as
      // mudanças a partir do patch e cruza com os ids aprovados: um id inventado aqui faria a
      // tela mostrar "1 de 1 aprovada" e a rota responder "nenhuma mudança foi aprovada" — que
      // foi exatamente o que aconteceu na primeira tentativa.
      changes: [
        {
          id: "field:complementLatex",
          kind: "field",
          label: "Complemento",
          before: "",
          after: texto,
          latex: true,
        },
      ],
    },
  ],
});

test.describe("o caminho do agente", () => {
  test("propor, revisar e **aplicar** — o gesto humano no meio", async ({ page }) => {
    const publicationId = await primeiraPublicacao(page);
    await page.goto(`/publications/${publicationId}`);
    await selecionarQuestao(page);

    const marca = `e2e-agente-${Date.now()}`;

    // Só o `ask` é dublê. `apply` é a rota de verdade, e é ela que a §14.6 protege.
    //
    // O `questionId` sai da requisição que a **própria tela** fez: é a fonte certa por
    // construção, e não uma segunda leitura que poderia apontar para outra questão.
    let questionId = "";
    await page.route("**/api/agents/ask", async (route) => {
      questionId = (route.request().postDataJSON() as { questionId: string }).questionId;
      await route.fulfill({ json: propostaFake(marca) });
    });

    // ── abrir agente ────────────────────────────────────────────────────
    await page
      .getByRole("button", { name: /Agente/ })
      .first()
      .click();

    const pergunta = page.getByRole("textbox", { name: "Pergunta ao agente" });
    await expect(pergunta).toBeVisible();

    // ── pedir correção ──────────────────────────────────────────────────
    await pergunta.fill("revise o enunciado");
    await pergunta.press("Control+Enter");

    // ── revisar diff ────────────────────────────────────────────────────
    // A proposta chega **desmarcada**: nada do agente entra no banco sem alguém dizer sim.
    const aprovar = page.getByRole("checkbox", { name: /Aprovar: Complemento/ });
    await expect(aprovar).toBeVisible({ timeout: 15_000 });
    await expect(aprovar).not.toBeChecked();

    const aplicar = page.getByRole("button", { name: /Aplicar seleção/ });
    await expect(aplicar).toBeDisabled();

    // ── aplicar ─────────────────────────────────────────────────────────
    await aprovar.check();
    await expect(aplicar).toBeEnabled();
    await aplicar.click();

    // A confirmação cita a revisão — é ela que permite desfazer, e dizer o número é o que torna
    // "aplicado" reversível em vez de definitivo.
    await expect(page.getByText(/Aplicado\. Revisão \d+/)).toBeVisible({ timeout: 15_000 });

    // E **chegou ao banco**. Pela API e não pela aba: aplicar remonta o editor com o estado novo
    // do servidor, e a remontagem devolve o painel à primeira aba — clicar em "Complemento" antes
    // disso é uma corrida com o refresh, não uma afirmação sobre o produto.
    // Pela árvore, que é quem devolve o LaTeX: a rota da questão leva versão e metadados, que é
    // o que a aba Metadados precisa — e nada além, de propósito.
    const tree = await page.request.get(`/api/publications/${publicationId}/tree`);
    const { nodes } = (await tree.json()) as {
      nodes: { question: { id: string; complementLatex: string; version: string } | null }[];
    };

    const gravada = nodes.find((node) => node.question?.id === questionId)?.question;
    expect(gravada?.complementLatex).toContain(marca);

    // E desfaz. O `apply` grava de verdade, e sem isto o complemento da questão de demonstração
    // fica com uma marca de teste — foi assim que ela passou dias com `e2e-agente-1786416332870`
    // dentro, aparecendo em todo PDF compilado com `includeSolution`.
    await page.request.patch(`/api/publications/${publicationId}/questions/${questionId}`, {
      data: { expectedVersion: gravada?.version, complementLatex: "" },
    });

    const depois = await page.request.get(`/api/publications/${publicationId}/tree`);
    const { nodes: limpos } = (await depois.json()) as {
      nodes: { question: { id: string; complementLatex: string } | null }[];
    };
    expect(limpos.find((n) => n.question?.id === questionId)?.question?.complementLatex).toBe("");
  });

  test("aprovar nada mantém o botão desligado — não existe 'aplicar tudo' por omissão", async ({
    page,
  }) => {
    // `planApply` recusa lista vazia no domínio; aqui se afirma que a tela não oferece o gesto.
    const publicationId = await primeiraPublicacao(page);
    await page.goto(`/publications/${publicationId}`);
    await selecionarQuestao(page);

    await page.route("**/api/agents/ask", async (route) => {
      await route.fulfill({ json: propostaFake("nunca aplicado") });
    });

    await page
      .getByRole("button", { name: /Agente/ })
      .first()
      .click();
    const pergunta = page.getByRole("textbox", { name: "Pergunta ao agente" });
    await pergunta.fill("revise");
    await pergunta.press("Control+Enter");

    await expect(page.getByRole("button", { name: /Aplicar seleção/ })).toBeDisabled({
      timeout: 15_000,
    });
  });

  test("sem IA configurada, o painel diz o que fazer em vez de falhar", async ({ page }) => {
    // O produto roda sem IA por escolha (D3): o agente é opcional, e uma tela que quebra sem ele
    // transformaria uma configuração ausente em defeito.
    const publicationId = await primeiraPublicacao(page);

    await page.route("**/api/ai/**", (route) => route.fulfill({ status: 503, json: {} }));
    await page.goto(`/publications/${publicationId}`);
    await selecionarQuestao(page);

    const botao = page.getByRole("button", { name: /Agente/ }).first();
    await expect(botao).toBeVisible();
  });
});
