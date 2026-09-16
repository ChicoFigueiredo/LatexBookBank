import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * **O E2E do scan estrutural** (Wave G · D45, D47, D53).
 *
 * ```text
 * livro com PDF fonte → Escanear o livro → proposta (o laço roda no servidor)
 * → o exercício que vira a página, com as duas âncoras navegáveis no PDF
 * → aprovar → o livro ganha capítulo, seção e exercícios a revisar
 * ```
 *
 * Nenhum modelo é chamado: o scan pedido aqui é só determinístico — é o caso que tem de funcionar
 * sem IA (§63). O PDF é a fixture sintética do livro C.
 */

const FIXTURE = path.join(__dirname, "..", "tests", "fixtures", "scan", "book-c.pdf");

test("escanear, revisar e aprovar um livro", async ({ page }) => {
  const marca = Date.now().toString(36);

  const biblioteca = await page.request.post("/api/libraries", { data: { name: `Scan E2E ${marca}` } });
  expect(biblioteca.ok()).toBeTruthy();
  const { library } = (await biblioteca.json()) as { library: { id: string } };

  const livro = await page.request.post(`/api/libraries/${library.id}/publications`, {
    data: { title: `Sequências ${marca}` },
  });
  expect(livro.ok()).toBeTruthy();
  const { publication } = (await livro.json()) as { publication: { id: string } };

  const upload = await page.request.post("/api/assets", {
    multipart: {
      workspaceId: library.id,
      publicationId: publication.id,
      kind: "SOURCE_PDF",
      file: { name: "book-c.pdf", mimeType: "application/pdf", buffer: readFileSync(FIXTURE) },
    },
  });
  expect(upload.ok(), await upload.text()).toBeTruthy();

  // O resumo do livro oferece o scan porque há PDF fonte.
  await page.goto(`/publications/${publication.id}`);
  await page.getByRole("link", { name: "Escanear o livro" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/publications/${publication.id}/scan$`));

  await page.getByLabel("Perfil de captura").selectOption("book-v1");
  const matematica = page.getByLabel("Reconhecimento matemático");
  if (await matematica.isEnabled()) await matematica.selectOption("never");
  await page.getByRole("button", { name: "Escanear" }).click();

  // A revisão abre enquanto o laço anda; a proposta chega sozinha.
  await expect(page).toHaveURL(/\/scan\/[0-9a-f-]+$/);
  const linhas = page.getByTestId("scan-tree-row");
  await expect(linhas.first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("pronta para revisar")).toBeVisible();

  // O exercício 2 é um item só, com duas âncoras.
  const exercicio = linhas.filter({ hasText: "×2" }).filter({ hasText: "Exercício" });
  await expect(exercicio).toHaveCount(1);
  await exercicio.click();
  await expect(page.getByText("Âncora 1 de 2")).toBeVisible();
  await expect(page.getByText("Página 2 de 3")).toBeVisible();
  await expect(page.getByTestId("scan-mark").first()).toBeVisible();

  await page.getByRole("button", { name: "▶" }).click();
  await expect(page.getByText("Âncora 2 de 2")).toBeVisible();
  await expect(page.getByText("Página 3 de 3")).toBeVisible();

  // Uma operação de revisão: rejeitar o primeiro exercício.
  await linhas.filter({ hasText: "Calcule o décimo termo" }).click();
  await page.getByRole("button", { name: "Rejeitar" }).click();
  await expect(linhas.filter({ hasText: "Calcule o décimo termo" })).toHaveAttribute("data-state", "REJECTED");

  // Aprovar em lote, com os sugeridos.
  await page.getByRole("button", { name: /^Aprovar \d+/ }).click();
  await expect(page.getByText("Aprovado", { exact: true })).toBeVisible();

  const arvore = await page.request.get(`/api/publications/${publication.id}/tree`);
  const { nodes } = (await arvore.json()) as { nodes: { kind: string; title: string | null; originalLabel: string | null }[] };
  expect(nodes.map((n) => n.kind)).toEqual(expect.arrayContaining(["CHAPTER", "SECTION", "QUESTION_GROUP", "QUESTION"]));
  // O rejeitado não entrou: sobram o 2 e o 3.
  expect(nodes.filter((n) => n.kind === "QUESTION").map((n) => n.originalLabel)).toEqual(["2", "3"]);

  // Recarregar não muda nada: a proposta e a marca "no acervo" são do servidor.
  await page.reload();
  await expect(exercicio).toBeVisible();
  await exercicio.click();
  await expect(page.getByText("Já está no acervo")).toBeVisible();

  // No editor: a questão está *a revisar*, e o PDF ao lado mostra as duas âncoras dela.
  await page.getByRole("link", { name: "Abrir no editor" }).click();
  await expect(page).toHaveURL(/\/editor\?node=/);
  await page.getByRole("button", { name: "A revisar" }).click();
  await expect(page.getByRole("treeitem", { name: /Questão 2/ })).toBeVisible();

  await page.getByRole("button", { name: "Ver fonte" }).click();
  const fonte = page.getByTestId("source-pane");
  await expect(fonte.getByText("Âncora 1 de 2 · principal")).toBeVisible();
  await fonte.getByRole("button", { name: "▶" }).click();
  await expect(fonte.getByText("Âncora 2 de 2 · continuação")).toBeVisible();
  await expect(fonte.getByText("Página 3 de 3")).toBeVisible();

  // Conferir tira a questão de *a revisar*.
  await page.getByRole("button", { name: "Conferido" }).click();
  await expect(page.getByRole("button", { name: "Conferido" })).toHaveCount(0);
  const depois = await page.request.get(`/api/publications/${publication.id}/tree`);
  const { nodes: finais } = (await depois.json()) as { nodes: { originalLabel: string | null; toReview: boolean }[] };
  expect(finais.find((n) => n.originalLabel === "2")?.toReview).toBe(false);
  expect(finais.find((n) => n.originalLabel === "3")?.toReview).toBe(true);
});
