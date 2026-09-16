import type { PublicationDraft } from "./publication-draft";

/**
 * Anexar o PDF fonte vindo do catálogo — e o que o catálogo pode **preencher** num livro que já
 * existe.
 *
 * A diferença entre importar e anexar cabe numa frase: importar cria o livro, e o que o catálogo
 * diz **é** o livro; anexar chega num livro que alguém já cadastrou, e o que o catálogo diz vale
 * menos que o que a pessoa digitou. Daí a regra desta camada, que é a D44.2 inteira:
 *
 * > **Só campo vazio é preenchido. Sobrescrever, nunca.**
 *
 * A regra mora aqui, e não na tela nem no route handler, porque ela é decidida **duas vezes** de
 * propósito: a tela do catálogo calcula a lista para mostrar antes de confirmar — com os dados que
 * ela já tem, sem inventar um endpoint de simulação — e o servidor recalcula com o livro que
 * acabou de ler do banco, que é a única versão que manda. Duas chamadas da mesma função pura, e
 * não duas implementações da mesma regra: se elas divergirem, o que vale é a do servidor, e a tela
 * mostrou uma promessa que o servidor cumpre com dado mais fresco.
 *
 * Ver D44 · `docs/_atual/_planejamento.md` §3.7.
 */

/**
 * O que o catálogo sabe, do ponto de vista de quem preenche campo vazio.
 *
 * Estruturalmente satisfeito por `CatalogEntry` — e também pelo DTO que a tela do catálogo declara
 * para si. Declarar o recorte mínimo aqui é o que permite a mesma função rodar nos dois lados sem
 * arrastar a porta do catálogo para dentro do bundle do cliente.
 */
export interface CatalogMetadata {
  readonly authors: readonly string[];
  readonly publisher: string | null;
  readonly year: number | null;
  readonly isbn: string | null;
  readonly language: string | null;
  readonly series: string | null;
  readonly seriesIndex: string | null;
}

/** O que o livro tem hoje. Só os campos que o catálogo poderia preencher. */
export interface PublicationMetadata {
  readonly authors: readonly string[];
  readonly publisher: string | null;
  readonly editionYear: number | null;
  readonly isbn: string | null;
  readonly language: string | null;
  readonly series: string | null;
  readonly volume: string | null;
}

export type CampoPreenchivel = keyof PublicationMetadata;

/** Uma linha da lista que a pessoa vê antes de confirmar. */
export interface CampoDoCatalogo {
  readonly field: CampoPreenchivel;
  /** Como o campo se chama na tela — o mesmo rótulo da grade de metadados do resumo do livro. */
  readonly label: string;
  /** O valor que entraria, já como se lê. */
  readonly value: string;
}

const ROTULOS: Readonly<Record<CampoPreenchivel, string>> = {
  authors: "Autores",
  publisher: "Editora",
  editionYear: "Ano",
  isbn: "ISBN",
  language: "Idioma",
  series: "Série",
  volume: "Volume",
};

/** Vazio é `null`, é `""` e é lista sem ninguém — as três coisas significam "não se sabe". */
const vazio = (value: string | number | readonly string[] | null | undefined): boolean =>
  value === null ||
  value === undefined ||
  (typeof value === "string" && value.trim() === "") ||
  (Array.isArray(value) && value.length === 0);

/**
 * O que o catálogo preencheria neste livro — e nada além disso.
 *
 * Duas sutilezas que não são detalhe:
 *
 * - **Volume só quando a coleção veio junto.** O Calibre grava `series_index = 1.0` em todo livro,
 *   com ou sem série (a mesma armadilha que `draftFromCatalog` já evita na importação). E se o
 *   livro já declara uma coleção **outra**, o índice do catálogo é o volume de outra coisa: seria
 *   escrever "volume 1" de uma série que não é a que está na ficha.
 * - **Autores é tudo ou nada.** Não há como mesclar duas listas de nomes sem inventar ordem e sem
 *   duplicar quem já está lá com grafia diferente. Livro com autor fica com o que tem.
 */
export function camposAPreencher(
  atual: PublicationMetadata,
  entry: CatalogMetadata,
): readonly CampoDoCatalogo[] {
  const campos: CampoDoCatalogo[] = [];

  const oferecer = (field: CampoPreenchivel, valor: string | null) => {
    if (valor === null || valor.trim() === "") return;
    campos.push({ field, label: ROTULOS[field], value: valor.trim() });
  };

  if (vazio(atual.authors) && !vazio(entry.authors)) {
    campos.push({ field: "authors", label: ROTULOS.authors, value: entry.authors.join("; ") });
  }
  if (vazio(atual.publisher)) oferecer("publisher", entry.publisher);
  if (vazio(atual.editionYear)) oferecer("editionYear", entry.year === null ? null : String(entry.year));
  if (vazio(atual.isbn)) oferecer("isbn", entry.isbn);
  if (vazio(atual.language)) oferecer("language", entry.language);
  if (vazio(atual.series)) oferecer("series", entry.series);

  const mesmaColecao = vazio(atual.series) || atual.series?.trim() === entry.series?.trim();
  if (vazio(atual.volume) && !vazio(entry.series) && mesmaColecao) {
    oferecer("volume", entry.seriesIndex);
  }

  return campos;
}

/**
 * O rascunho do livro com os campos vazios preenchidos — o resto intacto, byte a byte.
 *
 * Devolve também a lista, porque quem chama precisa **dizer o que fez**: anexar em silêncio e
 * mudar a ficha do livro por tabela seria a mesma surpresa que a D44 recusa do outro lado.
 */
export function preencherVazios(
  atual: PublicationDraft,
  entry: CatalogMetadata,
): { readonly draft: PublicationDraft; readonly campos: readonly CampoDoCatalogo[] } {
  const campos = camposAPreencher(atual, entry);
  if (campos.length === 0) return { draft: atual, campos };

  const preenche = (field: CampoPreenchivel) => campos.some((campo) => campo.field === field);

  return {
    draft: {
      ...atual,
      authors: preenche("authors") ? [...entry.authors] : atual.authors,
      publisher: preenche("publisher") ? entry.publisher : atual.publisher,
      editionYear: preenche("editionYear") ? entry.year : atual.editionYear,
      isbn: preenche("isbn") ? entry.isbn : atual.isbn,
      language: preenche("language") ? entry.language : atual.language,
      series: preenche("series") ? entry.series : atual.series,
      volume: preenche("volume") ? entry.seriesIndex : atual.volume,
    },
    campos,
  };
}
