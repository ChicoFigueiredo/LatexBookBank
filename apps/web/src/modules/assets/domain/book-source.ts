import type { AssetKind } from "./asset-kind";

/**
 * O PDF fonte de um livro — e a regra de quando um upload vira uma.
 *
 * A regra é curta e é de domínio: **um PDF subido para dentro de um livro que ainda não tem fonte
 * torna-se a fonte dele**. Ela existia só no import do Calibre, que grava `sourcePdfAssetId` ao
 * criar a publicação; quem chegava pela pendência “Sem PDF fonte anexado” subia o PDF na
 * ingestão, via a tela funcionar, e nada era anexado — o `Asset` nascia com `publicationId` nulo e
 * o livro continuava sem fonte. O upload sumia em silêncio.
 *
 * Duas coisas ficam **fora** desta regra, de propósito:
 *
 * - **Só PDF vira fonte.** A ingestão também aceita imagem (#185), e uma foto de página avulsa não
 *   é o arquivo-fonte do livro. `SOURCE_IMAGE` continua sendo asset do livro sem virar a fonte.
 * - **Fonte que já existe não é substituída.** A D29 diz que fonte é patrimônio e imutável; trocar
 *   o PDF de um livro é uma decisão editorial com consequências (as âncoras já gravadas apontam
 *   para o PDF antigo), e não pode acontecer como efeito colateral de um upload. Quem garante isso
 *   é o `AssetWriter`, condicionando a escrita a `sourcePdfAssetId` ainda estar nulo — e não uma
 *   leitura prévia daqui, que abriria a janela entre ler e escrever.
 *
 * Ver spec §10 · D29 · issue #123.
 */

/**
 * O que a escrita precisa saber sobre o arquivo que acabou de ser guardado.
 *
 * Declarado aqui, e não importado da camada de aplicação, porque a dependência aponta para dentro.
 * É o mesmo recorte que `AssetForLatex` faz: o domínio nomeia o que precisa, e o registro que a
 * aplicação monta a partir do `StorageProvider` o satisfaz estruturalmente.
 */
export interface NewAsset {
  readonly workspaceId: string;
  /** O livro dono do arquivo. Nulo quando o upload não veio de dentro de um livro. */
  readonly publicationId: string | null;
  readonly questionId: string | null;
  readonly kind: AssetKind;
  readonly storageKey: string;
  readonly mimeType: string;
  readonly originalFilename: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly width: number | null;
  readonly height: number | null;
}

export interface WrittenAsset {
  readonly id: string;
  /** `true` quando **esta** escrita foi a que anexou o PDF fonte ao livro. */
  readonly becameBookSource: boolean;
}

/** Grava o asset — e, quando pedido, anexa-o ao livro como PDF fonte. */
export interface AssetWriter {
  /**
   * `asBookSourceOf` não-nulo pede que `Publication.sourcePdfAssetId` daquele livro passe a
   * apontar para o asset recém-gravado — **na mesma transação**, e **só se ainda for nulo**.
   *
   * As duas condições são o defeito que este contrato conserta:
   *
   * - *mesma transação*, porque gravar o asset e apontar a fonte em dois passos deixa asset órfão
   *   quando o segundo falha, que é exatamente o estado em que o acervo estava;
   * - *só se ainda for nulo*, porque dois uploads simultâneos para o mesmo livro sem fonte não
   *   podem deixar o campo apontando para um e o outro perdido — e porque é o que impede um
   *   upload qualquer de substituir uma fonte que já existe.
   *
   * O segundo devolve `becameBookSource: false`: o asset foi gravado e pertence ao livro, mas a
   * fonte continua sendo a que já estava lá.
   */
  write(asset: NewAsset, asBookSourceOf: string | null): Promise<WrittenAsset>;
}

/**
 * O tipo de upload que pode virar PDF fonte.
 *
 * `SOURCE_PDF` e só ele: é o que a ingestão sabe paginar e recortar, e é o que a coluna se chama.
 */
export const isBookSourceCandidate = (kind: AssetKind): boolean => kind === "SOURCE_PDF";

/**
 * O livro para o qual este upload vira fonte — ou `null`, quando ele não vira.
 *
 * Sem consultar nada: se o livro já tem fonte é o `AssetWriter` que recusa, e recusar aqui exigiria
 * uma leitura que ficaria velha antes da escrita.
 */
export const bookSourceTargetOf = (asset: NewAsset): string | null =>
  asset.publicationId !== null && isBookSourceCandidate(asset.kind) ? asset.publicationId : null;
