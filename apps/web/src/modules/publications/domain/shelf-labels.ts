/**
 * Rótulos curtos da estante — autor e edição numa coluna estreita.
 *
 * Puros e no domínio, e não escondidos no read model, por um motivo prático: o formato de nome que
 * chega do Calibre é diferente do que alguém digita à mão, e a regra que reconcilia os dois é a
 * coisa mais fácil de errar em silêncio nesta tela. Aqui ela tem teste.
 */

/**
 * O sobrenome, nos dois formatos que o acervo recebe.
 *
 * O Calibre grava `"Iezzi, Gelson"` — sobrenome primeiro. Quem cadastra à mão escreve
 * `"Gelson Iezzi"`. Pegar sempre a última palavra parece funcionar até um livro importado aparecer
 * na estante como "Gelson e Carlos", que é o primeiro nome de duas pessoas diferentes e não
 * identifica nenhuma das duas.
 *
 * A vírgula é o sinal, e é confiável: nome pessoal não tem vírgula por outro motivo.
 */
export function sobrenome(nome: string): string {
  const limpo = nome.trim();
  if (limpo === "") return "";

  const virgula = limpo.indexOf(",");
  if (virgula > 0) return limpo.slice(0, virgula).trim();

  const partes = limpo.split(/\s+/);
  return partes[partes.length - 1] ?? "";
}

/**
 * "Iezzi" · "Iezzi e Murakami" · "Iezzi e outros".
 *
 * Três nomes numa coluna de 8,5rem viram reticências no meio do segundo, e reticências não
 * identificam ninguém. "e outros" diz a mesma coisa e cabe.
 */
export function formatarAutores(nomes: readonly string[]): string | null {
  const sobrenomes = nomes.map(sobrenome).filter((nome) => nome !== "");

  if (sobrenomes.length === 0) return null;
  if (sobrenomes.length === 1) return sobrenomes[0] ?? null;
  if (sobrenomes.length === 2) return `${sobrenomes[0]} e ${sobrenomes[1]}`;
  return `${sobrenomes[0]} e outros`;
}

/** "3ª ed." · "2021" · "3ª ed., 2021" — e `null` quando não se sabe nem uma coisa nem outra. */
export function formatarEdicao(edition: string | null, editionYear: number | null): string | null {
  const partes = [edition?.trim() || null, editionYear ? String(editionYear) : null].filter(
    (parte): parte is string => parte !== null,
  );

  return partes.length > 0 ? partes.join(", ") : null;
}

/** O carimbo da lombada: o volume quando há, senão a inicial do título. */
export const carimboDaLombada = (titulo: string, volume: string | null): string =>
  volume?.trim() || titulo.trim().charAt(0).toUpperCase() || "?";
