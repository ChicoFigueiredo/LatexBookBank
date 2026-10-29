import { buildLines } from "@modules/scan/domain/page";
import { rankProfiles, type RankedProfile } from "@modules/scan/domain/profiles";

import type { OpenedPdf, PdfDocumentOpener } from "./pdf-document";
import type { ScanSourceReader } from "./scan-store";

/**
 * Qual perfil de captura este PDF pede ([ADR 0007](../../../../../../docs/adr/0007-o-perfil-de-captura-e-codigo.md)).
 *
 * Antes disto, a sugestão era a lembrança do livro — e, sem lembrança, o literal `book-v1`. Um
 * caderno do ENEM anexado a um livro novo chegava com "Livro-texto" escolhido, e quem não
 * conhecesse os três perfis pela descrição varria trinta e duas páginas para descobrir.
 *
 * A pergunta é respondida pelos próprios perfis: cada um pontua a amostra, e quem sabe reconhecer
 * "QUESTÃO N em duas colunas" é o `exam-enem-v1`. Um perfil novo entra no registro e a sugestão
 * melhora junto, sem que nada aqui mude.
 */

/**
 * Quantas páginas bastam para reconhecer um documento.
 *
 * Dezesseis, e o número é medido, não escolhido. Com oito, o *Fundamentos de Matemática
 * Elementar* era lido como prova de concurso: os marcos que o identificam — o banner
 * `E X E R C Í C I O S` e a seção em romano — são **raros, não densos** (62 banners em 269
 * páginas de corpo), e uma amostra de oito não encontrava nenhum. Medido nos onze PDFs do
 * corpus: com oito, dez acertos e um erro; com dezesseis, onze acertos, e a margem sobre o
 * segundo colocado cresce em todos.
 *
 * O preço é o dobro de páginas lidas — ainda muito longe de abrir um volume inteiro, que para
 * 447 páginas levaria dezesseis segundos e ninguém espera por isso.
 */
export const SAMPLE_PAGES = 16;

/**
 * **Quais** páginas — espalhadas, nunca as primeiras.
 *
 * As primeiras páginas de qualquer PDF são as menos características que ele tem: o caderno do
 * ENEM abre com instruções e folha de rosto, e o livro-texto abre com capa, créditos, prefácio e
 * sumário. Medido no *Curso de Análise*: lendo as oito primeiras, o `book-v1` pontuava **zero**
 * no próprio livro dele, porque nenhum capítulo começa antes da página 13.
 *
 * Espalhar custa o mesmo — uma página lida é uma página lida, perto ou longe — e enxerga o miolo.
 */
export function samplePageNumbers(pageCount: number): readonly number[] {
  if (pageCount <= SAMPLE_PAGES) return Array.from({ length: pageCount }, (_, i) => i + 1);
  return Array.from({ length: SAMPLE_PAGES }, (_, i) =>
    Math.max(1, Math.min(pageCount, Math.round((pageCount * (i + 1)) / (SAMPLE_PAGES + 1)))),
  );
}

export interface SuggestProfileDeps {
  readonly sources: ScanSourceReader;
  readonly storage: { get(key: string): Promise<{ readonly content: Uint8Array }> };
  readonly opener: PdfDocumentOpener;
  readonly sourceKey: (assetId: string) => Promise<string | null>;
}

export interface ProfileSuggestion {
  readonly ranking: readonly RankedProfile[];
  /** Quantas páginas foram lidas de verdade — a tela diz isso, para o palpite ser conferível. */
  readonly sampledPages: number;
}

export async function suggestCaptureProfile(
  deps: SuggestProfileDeps,
  publicationId: string,
): Promise<ProfileSuggestion | null> {
  const source = await deps.sources.sourceFor(publicationId);
  if (!source) return null;

  const key = await deps.sourceKey(source.assetId);
  if (!key) return null;

  const stored = await deps.storage.get(key);
  let pdf: OpenedPdf | null = null;
  try {
    pdf = await deps.opener.open(stored.content);
    const pages = [];
    for (const page of samplePageNumbers(pdf.pageCount)) pages.push(buildLines(await pdf.readPage(page)));
    return { ranking: rankProfiles(pages), sampledPages: pages.length };
  } finally {
    await pdf?.close();
  }
}
