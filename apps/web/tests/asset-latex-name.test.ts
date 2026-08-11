import { describe, expect, it } from "vitest";

import {
  assetLatexName,
  latexExtensionFor,
  type AssetForLatex,
} from "@modules/assets/domain/asset-latex-name";

/**
 * O nome que aparece dentro do `\includegraphics`.
 *
 * Ele é gravado no enunciado de alguém e é o mesmo que o worker usa para escrever o arquivo no
 * diretório do job. Se o cliente e o servidor calcularem nomes diferentes, o LaTeX cita um arquivo
 * que nunca chega — e a mensagem que aparece é `File not found`, que manda procurar defeito no
 * texto de quem escreveu.
 *
 * Ver issue #173 · D29 · D35.
 */

const asset = (over: Partial<AssetForLatex> = {}): AssetForLatex => ({
  sha256: "aabbccdd11223344556677889900aabbccddeeff00112233445566778899aabb",
  mimeType: "image/png",
  originalFilename: "Gráfico de Juros.png",
  ...over,
});

describe("o nome do asset no LaTeX", () => {
  it("é legível: sai do nome do arquivo, sem acento e sem espaço", () => {
    // Quem lê é a pessoa, no meio do enunciado dela. `6f2a1c...png` seria correto e ilegível.
    expect(assetLatexName(asset())).toBe("grafico-de-juros-aabbccdd.png");
  });

  it("**dois arquivos de mesmo nome não colidem** — o sufixo é o conteúdo", () => {
    // `grafico.png` da página 3 e `grafico.png` da página 7 existem na mesma questão. Sem o
    // sufixo, o segundo sobrescreveria o primeiro dentro do diretório do job, em silêncio.
    const a = assetLatexName(
      asset({ originalFilename: "grafico.png", sha256: "1111" + "0".repeat(60) }),
    );
    const b = assetLatexName(
      asset({ originalFilename: "grafico.png", sha256: "2222" + "0".repeat(60) }),
    );

    expect(a).not.toBe(b);
  });

  it("mesmo conteúdo dá o mesmo nome — é a D29 valendo aqui também", () => {
    expect(assetLatexName(asset())).toBe(assetLatexName(asset()));
  });

  it("nunca escapa do diretório do job", () => {
    // O contrato recusa barra, `..` e nome absoluto. Este teste garante que a recusa nunca precisa
    // acontecer: o nome já nasce seguro.
    for (const nome of ["../../etc/passwd", "/absoluto/x.png", "pasta/sub/x.png", "..\\win.png"]) {
      const name = assetLatexName(asset({ originalFilename: nome }));

      expect(name).not.toContain("/");
      expect(name).not.toContain("\\");
      expect(name).not.toContain("..");
    }
  });

  it("nome vazio ou só símbolos vira `figura`, não string vazia", () => {
    // `\includegraphics{-aabbccdd.png}` compilaria pedindo um arquivo com nome esquisito; pior,
    // um nome vazio quebraria a validação do bundle depois de o texto já estar salvo.
    expect(assetLatexName(asset({ originalFilename: "___.png" }))).toBe("figura-aabbccdd.png");
    expect(assetLatexName(asset({ originalFilename: null }))).toBe("figura-aabbccdd.png");
  });

  it("a extensão vem do **MIME**, não do nome", () => {
    // `\includegraphics` escolhe o leitor pela extensão, e um `.jpeg` renomeado para `.png` faz o
    // `pdflatex` falhar com "Cannot determine size of graphic" — mensagem que manda depurar o
    // LaTeX em vez do arquivo. O MIME já foi conferido contra o conteúdo na ingestão.
    expect(assetLatexName(asset({ originalFilename: "foto.png", mimeType: "image/jpeg" }))).toBe(
      "foto-aabbccdd.jpg",
    );
  });

  it("MIME desconhecido cai em `png` em vez de ficar sem extensão", () => {
    expect(latexExtensionFor("application/octet-stream")).toBe("png");
    expect(latexExtensionFor("IMAGE/PNG")).toBe("png");
  });

  it("nome longo é cortado — `\\includegraphics` de 300 caracteres é ilegível", () => {
    const name = assetLatexName(asset({ originalFilename: `${"a".repeat(300)}.png` }));

    expect(name.length).toBeLessThan(60);
  });
});
