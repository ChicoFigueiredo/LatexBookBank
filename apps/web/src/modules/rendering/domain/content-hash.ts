import type { RenderBundle } from "@latexbookbank/render-contract";

/**
 * A identidade de um render.
 *
 * O cache de render só é seguro se a chave cobrir **tudo** que muda o PDF. Uma chave incompleta
 * não erra de vez em quando: ela serve o PDF antigo silenciosamente, e a pessoa fica olhando uma
 * tela que não reflete o que ela escreveu — o pior modo de falha possível, porque parece que o
 * produto está funcionando.
 *
 * O planejamento lista o que precisa entrar: conteúdo, profile, template, preamble, assets,
 * engine, parâmetros e **versão do renderer**. A última é a menos óbvia e a mais importante: subir
 * a imagem com um TeX Live novo muda a saída sem mudar uma linha do documento, e sem ela o cache
 * passaria a servir PDF de outra época.
 *
 * O que **não** entra é o `jobId`. Ele é identidade de execução, não de conteúdo; incluí-lo faria
 * cada pedido ter chave nova e o cache nunca acertar.
 */

/**
 * A entrada canônica do hash, como texto.
 *
 * Serializada à mão, e não com `JSON.stringify` do objeto inteiro, por dois motivos. A ordem das
 * chaves de um objeto não é garantia de linguagem — é consequência de como ele foi montado —, e um
 * dia alguém troca a ordem de dois campos e invalida o cache inteiro sem saber por quê. E, mais
 * grave, `JSON.stringify` **incluiria o `jobId`**: bastaria alguém acrescentar um campo ao bundle
 * para o cache parar de funcionar em silêncio.
 *
 * Cada parte vai prefixada e em linha própria, e **as listas vão em JSON**.
 *
 * O JSON não é capricho: os prefixos separam campo de campo, mas não elemento de elemento. Com
 * `join("")`, um preâmbulo `["a","b"]` e outro `["ab"]` dariam o mesmo texto e passariam a
 * compartilhar cache indevidamente. A primeira versão separava com um caractere de controle —
 * que funciona e é **invisível no editor**, então a próxima pessoa a ler a linha veria um
 * `join("")` aparentemente errado, "consertaria", e quebraria o cache sem que nada acusasse.
 * JSON faz a mesma separação à vista de todos.
 */
export function canonicalRenderInput(bundle: RenderBundle, rendererVersion: string): string {
  const { profile, options } = bundle;

  return [
    `renderer:${rendererVersion}`,
    `engine:${profile.engine}`,
    `class:${profile.documentClass}`,
    `classOptions:${JSON.stringify(profile.documentClassOptions)}`,
    `preamble:${JSON.stringify(profile.preamble)}`,
    `dpi:${options.dpi}`,
    `passes:${options.passes}`,
    // O timeout **não** entra: ele muda quanto tempo esperamos, não o que sai. Incluí-lo faria
    // um render lento invalidar o cache do rápido, para o mesmo documento.
    ...bundle.assets
      // Ordenados por nome: o mesmo conjunto de arquivos em ordem diferente é o mesmo conjunto,
      // e o LaTeX os referencia por nome, não por posição.
      .map((asset) => `asset:${asset.name}:${asset.sha256}`)
      .sort(),
    `source:${bundle.sourceLatex}`,
  ].join("\n");
}

/**
 * O hash, em hexadecimal.
 *
 * Usa `crypto.subtle`, que existe no Node moderno e no runtime de borda — o mesmo código serve os
 * dois, o que importa porque a Fase 6.5 vai levar isto para a nuvem.
 */
export async function renderContentHash(
  bundle: RenderBundle,
  rendererVersion: string,
): Promise<string> {
  const input = new TextEncoder().encode(canonicalRenderInput(bundle, rendererVersion));
  const digest = await crypto.subtle.digest("SHA-256", input);

  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
