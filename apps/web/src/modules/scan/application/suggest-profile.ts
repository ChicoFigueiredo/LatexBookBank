import type { CaptureProfile } from "@modules/scan/domain/capture-profile";
import { buildLines, type PageModel } from "@modules/scan/domain/page";
import {
  PROFILE_MISMATCH_MARGIN,
  rankProfiles,
  type RankedProfile,
} from "@modules/scan/domain/profiles";

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

/**
 * O perfil escolhido foi o errado? (ADR 0007)
 *
 * As páginas já estão lidas e os perfis já sabem se pontuar — a mesma nota que sugere antes da
 * varredura acusa depois dela. O sintoma que motivou isto é mudo por natureza: varrer um livro com
 * o perfil errado não dá erro nenhum, dá 453 seções onde deviam existir vinte.
 *
 * **A mesma amostra**, e não o livro inteiro. A nota é densidade de sinais por página, e um perfil
 * cujos marcos são raros — 61 banners em 420 páginas — afunda quando o denominador é o volume
 * todo. Medido: com o livro inteiro, o `book-fme-v1` acusava a si mesmo de ter lido errado o livro
 * para o qual foi escrito. Com a amostra, ele ganha de longe, que é o mesmo resultado que a
 * sugestão dá antes de a varredura começar.
 *
 * O aviso lidera pelo que é certo — este perfil reconheceu pouco — e só depois nomeia o candidato.
 * A ordem importa: o alarme acerta sempre que dispara, e o palpite de qual seria o perfil certo
 * pode errar num livro para o qual ainda não existe perfil nenhum.
 */
export function profileMismatchWarning(
  pages: readonly PageModel[],
  profile: CaptureProfile,
): string | null {
  const ranking = rankProfiles(
    samplePageNumbers(pages.length).flatMap((n) => {
      const page = pages[n - 1];
      return page ? [page] : [];
    }),
  );
  const best = ranking[0];
  const chosen = ranking.find((entry) => entry.id === profile.id);
  if (!best || !chosen || best.id === profile.id) return null;
  if (best.score - chosen.score <= PROFILE_MISMATCH_MARGIN) return null;

  return `O perfil "${profile.label}" reconheceu pouco deste PDF (${chosen.evidence}). O que mais se parece com ele é "${best.label}" (${best.evidence}) — confira a proposta antes de aprovar.`;
}
