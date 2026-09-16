import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * **`width:100%` com recuo só é seguro sob `border-box` — e o reset precisa continuar lá.**
 *
 * O guarda irmão do `tokens-existem`, motivado por um defeito da mesma família: silencioso,
 * espalhado e visível o tempo todo sem ninguém apontar o dedo para ele.
 *
 *   .lbb-row{display:flex;width:100%;padding:11px var(--space-4)}
 *
 * Sob `content-box` — que era o padrão do projeto, porque reset nenhum existia — essa linha mede
 * 100% **mais** os dois recuos e estoura o pai por 32px. Na Home, o efeito era a seta de cada
 * pendência ("Revisar", "Abrir a fila", "Começar") cortada rente à borda direita. Havia quinze
 * regras assim, incluindo todo campo de texto do produto.
 *
 * O teste guarda as duas únicas formas de o defeito voltar: apagar o reset, ou desfazê-lo local
 * e deliberadamente com `content-box`. Não há terceira — o reset é universal e o único CSS da
 * raiz, e o app não escreve estilo em Shadow DOM nem em `srcdoc`, que seriam os lugares fora do
 * alcance dele. Se um dia escrever, é este arquivo que precisa crescer.
 */

const raiz = fileURLToPath(new URL("..", import.meta.url));

const semComentarios = (codigo: string): string =>
  codigo.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

function varrer(dir: string): string[] {
  const encontrados: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "generated" || entry.name === "node_modules") continue;

    const alvo = path.join(dir, entry.name);
    if (entry.isDirectory()) encontrados.push(...varrer(alvo));
    else if (/\.(tsx?|css)$/.test(entry.name)) encontrados.push(alvo);
  }

  return encontrados;
}

describe("as caixas do layout", () => {
  it("o reset de border-box está em tokens.css, que é o único CSS carregado na raiz", () => {
    const tokens = readFileSync(path.join(raiz, "src/design-system/tokens.css"), "utf8");

    // Universal e com os pseudoelementos: sem `::before/::after` os separadores e as setas
    // desenhadas por conteúdo continuam medindo por fora.
    expect(tokens).toMatch(/\*\s*,\s*\*::before\s*,\s*\*::after\s*\{[^}]*box-sizing:\s*border-box/);
  });

  it("ninguém desfaz o reset com content-box", () => {
    const arquivos = [...varrer(path.join(raiz, "src")), ...varrer(path.join(raiz, "app"))];

    const desfazem = arquivos.filter((arquivo) =>
      /box-sizing\s*:\s*content-box/.test(semComentarios(readFileSync(arquivo, "utf8"))),
    );

    // `content-box` local devolve o estouro para aquela subárvore, e o sintoma reaparece só nela
    // — que é a versão mais difícil de achar do mesmo defeito.
    expect(desfazem.map((arquivo) => path.relative(raiz, arquivo))).toEqual([]);
  });

  it("as regras que motivaram o reset continuam existindo — se sumirem, o guarda perde o alvo", () => {
    // Sem isto, apagar `.lbb-row` e `.lbb-input` deixaria o teste verde para sempre guardando um
    // reset que já não protege ninguém. O número é aproximado de propósito: o que importa é a
    // ordem de grandeza, não o inventário.
    const arquivos = [...varrer(path.join(raiz, "src")), ...varrer(path.join(raiz, "app"))];
    let dependentes = 0;

    for (const arquivo of arquivos) {
      const codigo = semComentarios(readFileSync(arquivo, "utf8"));

      for (const [, corpo] of codigo.matchAll(/[.#[][^{};]{0,120}?\{([^}]*)\}/g)) {
        const bloco = (corpo ?? "").replace(/\n/g, " ");
        if (!/(?:^|;)\s*width\s*:\s*100%/.test(bloco)) continue;
        if (/(?:^|;)\s*padding[^:]*:\s*(?!0[a-z%]*\s*[;}])[^;]*\d/.test(bloco)) dependentes += 1;
      }
    }

    expect(dependentes).toBeGreaterThan(8);
  });
});
