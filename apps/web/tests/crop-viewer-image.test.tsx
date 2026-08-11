// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import PdfCropViewerInner from "@modules/assets/ui/PdfCropViewerInner";

/**
 * **Imagem não é PDF** (#185).
 *
 * A tela de ingestão promete "suba um PDF **ou imagem**", e o visualizador mandava tudo para o
 * `pdf.js`. Subir um PNG dava, em tela:
 *
 *     Não deu para abrir o PDF: Invalid PDF structure.
 *
 * Uma mensagem correta sobre a pergunta errada — e o epic inteiro da ingestão parava ali para
 * qualquer arquivo que não fosse PDF.
 *
 * O teste é do **desvio**, não do desenho: ele afirma que o caminho do PDF não é tomado e que a
 * imagem é tratada como documento de uma página. Rasterizar de verdade exige um canvas com
 * contexto 2D, que o ambiente de teste não tem — e o que quebrava não era o desenho, era a
 * escolha do caminho.
 *
 * Ver spec §13 · issue #185.
 */

afterEach(cleanup);

/** Um PNG 1×1 em data URL: o componente não precisa decodificá-lo para escolher o caminho. */
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const mostrar = (mimeType: string, fileUrl = PNG) =>
  render(<PdfCropViewerInner fileUrl={fileUrl} mimeType={mimeType} onCrop={vi.fn()} />);

describe("o visualizador com uma imagem", () => {
  it("**não** tenta abrir como PDF", async () => {
    mostrar("image/png");

    // Um instante para o efeito rodar: o erro do `pdf.js` aparecia de forma assíncrona, e uma
    // asserção síncrona passaria mesmo com o defeito presente.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(screen.queryByText(/Não deu para abrir o PDF/)).toBeNull();
  });

  it("trata a imagem como documento de **uma página**", async () => {
    mostrar("image/png");

    // É o que faz o resto da tela funcionar igual: navegação, escala e recorte já operavam sobre
    // uma página; a imagem só precisava declarar que tem uma.
    await waitFor(() => expect(screen.getByText(/página 1 de 1/)).toBeTruthy());
  });

  it("jpeg e webp seguem o mesmo caminho — a decisão é o prefixo `image/`", async () => {
    for (const tipo of ["image/jpeg", "image/webp"]) {
      const view = mostrar(tipo);
      await waitFor(() => expect(screen.getByText(/página 1 de 1/)).toBeTruthy());
      view.unmount();
    }
  });

  it("sem `mimeType`, continua sendo PDF — o padrão não muda para quem já usava", async () => {
    // O controle que importa: a aba Origem monta este componente com um PDF e **não** passa o
    // tipo. Se o padrão tivesse virado imagem, "voltar à origem" pararia de desenhar a página.
    mostrar("application/pdf", "/api/assets/inexistente/content");

    // Sem página declarada, a barra não anuncia "1 de 1": quem conta as páginas é o `pdf.js`.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText(/página 1 de 1/)).toBeNull();
  });
});
