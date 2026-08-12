"use client";

import Link from "next/link";

import { Button, Icon, type IconName } from "@/design-system";

import { useAcervoStyles } from "../../acervo-styles";
import { AppShell } from "../../app-shell";

/**
 * O overview de um livro — a parada entre escolher e editar (protótipo, 492–599).
 *
 * Até aqui `/publications/[id]` abria o workbench direto, e era um salto: quem clica num livro na
 * estante ainda não decidiu *o que fazer com ele*, e a árvore de 148 nós não responde "o que falta
 * aqui". Esta tela responde, com quatro blocos e nada mais — identidade, o que está errado, a
 * estrutura e a fonte —, e o editor passou a morar em `/publications/[id]/editor`.
 *
 * É também o motivo pelo qual o rail do protótipo lista `Publicações` **e** `Editor do livro`:
 * são dois lugares diferentes, e agora o app tem os dois.
 */

/**
 * O DTO da tela, declarado aqui e não importado do read model.
 *
 * O read model é `server-only`, e um `import type` que atravessa essa fronteira volta a puxar o
 * módulo no bundle do cliente na primeira vez que alguém trocar o `type` por um valor. A estante
 * declara o dela pelo mesmo motivo; o `page.tsx` liga os dois, e o `tsc` reclama se divergirem.
 */
export interface CapituloDaTela {
  readonly id: string;
  readonly label: string;
  readonly title: string;
  readonly questionCount: number;
  readonly invalidCount: number;
  readonly reviewedCount: number;
  readonly pct: number;
}

export interface PendenciaDaTela {
  readonly kind: string;
  readonly label: string;
  readonly where: string;
  readonly cta: string;
  readonly href: string;
  readonly icon: IconName;
}

export interface BookOverviewScreenProps {
  readonly book: {
    readonly id: string;
    readonly title: string;
    readonly subtitle: string | null;
    readonly nickname: string | null;
    readonly authors: string | null;
    readonly libraryName: string;
    readonly librarySlug: string;
    readonly mark: string;
    readonly meta: readonly { readonly k: string; readonly v: string }[];
    readonly chapters: readonly CapituloDaTela[];
    readonly questionCount: number;
    readonly invalidCount: number;
    readonly issues: readonly PendenciaDaTela[];
    readonly source: {
      readonly filename: string;
      readonly size: string;
      readonly origin: string;
    } | null;
    readonly capture: {
      readonly queued: number;
      readonly lastPage: number | null;
      readonly pct: number;
      readonly label: string;
    } | null;
    readonly reviewedRange: string | null;
  };
}

export function BookOverviewScreen({ book }: BookOverviewScreenProps) {
  useAcervoStyles();

  const editor = `/publications/${book.id}/editor`;
  const captura = `/publications/${book.id}/ingestao`;

  return (
    <AppShell
      activeModule="publicacoes"
      publicationId={book.id}
      breadcrumb={[
        { label: "Bibliotecas", href: "/bibliotecas" },
        { label: book.libraryName, href: `/bibliotecas/${book.librarySlug}` },
        { label: book.title },
      ]}
    >
      <div className="lbb-acervo">
        <div className="lbb-book-head">
          {/* A lombada desenhada, não a capa real: o acervo importado quase nunca traz imagem, e
              um retângulo cinza escrito "sem capa" identifica menos que o título na lombada. */}
          <div className="lbb-book-cover" aria-hidden>
            <div className="lbb-book-cover-title">{book.title}</div>
            <div>
              <div className="lbb-book-cover-mark">{book.mark}</div>
              {book.authors && <div className="lbb-book-cover-author">{book.authors}</div>}
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="lbb-greet">Publicação · {book.libraryName}</div>
            <h1 className="lbb-book-title">
              {book.title}
              {/*
                O apelido ao lado do título, e não na grade de metadados: metadado é o que se
                consulta, e o apelido é como o livro se chama — pertence à identidade, junto do
                título, e não à lista de fichas catalográficas embaixo.
              */}
              {book.nickname && <span className="lbb-shelf-nick">{book.nickname}</span>}
            </h1>
            <div className="lbb-book-sub">
              {[book.subtitle, book.authors].filter(Boolean).join(" · ") || "Sem subtítulo"}
            </div>

            {book.meta.length > 0 && (
              <dl className="lbb-book-meta">
                {book.meta.map((par) => (
                  <div key={par.k}>
                    <dt>{par.k}</dt>
                    <dd>{par.v}</dd>
                  </div>
                ))}
              </dl>
            )}

            <div className="lbb-acervo-actions">
              <Button variant="primary" icon="pencil" href={editor}>
                Abrir no editor
              </Button>
              <Button variant="secondary" icon="scan-text" href={captura}>
                Capturar questões
              </Button>
              {book.source && (
                <Button variant="secondary" icon="file-text" href={captura}>
                  Abrir fonte (PDF)
                </Button>
              )}
              <Button variant="ghost" icon="settings-2" href={`${editor}?metadados=1`}>
                Metadados
              </Button>
            </div>
          </div>
        </div>

        {book.issues.length > 0 && (
          <section className="lbb-attention" aria-labelledby="lbb-atencao">
            <div className="lbb-attention-head">
              <Icon name="triangle-alert" size={14} />
              <span id="lbb-atencao">Precisa da sua atenção</span>
              <span className="lbb-attention-count">
                {book.issues.length} {book.issues.length === 1 ? "item" : "itens"}
              </span>
            </div>
            {book.issues.map((issue) => (
              <Link key={issue.kind} className="lbb-attention-row" href={issue.href}>
                <Icon name={issue.icon} size={14} />
                <span className="lbb-attention-label">{issue.label}</span>
                <span className="lbb-attention-where">{issue.where}</span>
                <span className="lbb-attention-cta">{issue.cta}</span>
              </Link>
            ))}
          </section>
        )}

        <div className="lbb-book-split">
          <section>
            <div className="lbb-section-head">
              <h2 className="lbb-greet-title" style={{ fontSize: "var(--text-section)" }}>
                Estrutura
              </h2>
              <span className="lbb-section-count">
                {book.chapters.length} {book.chapters.length === 1 ? "capítulo" : "capítulos"} ·{" "}
                {book.questionCount} {book.questionCount === 1 ? "questão" : "questões"}
              </span>
            </div>

            {book.chapters.length === 0 ? (
              <div className="lbb-chapters">
                <div className="lbb-chapter" style={{ color: "var(--text-secondary)" }}>
                  Nenhum capítulo ainda — a estrutura nasce no editor ou vem da importação.
                </div>
              </div>
            ) : (
              <div className="lbb-chapters">
                {book.chapters.map((capitulo) => (
                  <Link
                    key={capitulo.id}
                    className="lbb-chapter"
                    href={`${editor}?node=${capitulo.id}`}
                  >
                    <span className="lbb-chapter-n">{capitulo.label}</span>
                    <span className="lbb-chapter-title">{capitulo.title}</span>
                    {/*
                      A barra tem três tons e nenhum é decorativo: verde é capítulo revisado
                      inteiro, âmbar é capítulo com questão reprovada, cinza é capítulo vazio.
                      A largura sozinha não distingue "quase pronto" de "quase todo errado".
                    */}
                    <span
                      className="lbb-bar"
                      data-tone={toneDoCapitulo(capitulo)}
                      role="img"
                      aria-label={`${capitulo.reviewedCount} de ${capitulo.questionCount} revisadas`}
                    >
                      <span style={{ width: `${capitulo.pct}%` }} />
                    </span>
                    <span className="lbb-chapter-count">
                      {capitulo.questionCount === 0
                        ? "—"
                        : `${capitulo.reviewedCount}/${capitulo.questionCount}`}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="lbb-source">
            <div className="lbb-acervo-eyebrow" style={{ marginBottom: 0 }}>
              Fonte editorial
            </div>

            {book.source ? (
              <>
                <div className="lbb-source-file">
                  <Icon name="file-text" size={18} />
                  <div style={{ minWidth: 0 }}>
                    <div className="lbb-source-name">{book.source.filename}</div>
                    <div className="lbb-source-size">{book.source.size}</div>
                  </div>
                </div>
                <div className="lbb-source-origin">{book.source.origin}</div>
                <div style={{ marginTop: "var(--space-3)" }}>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon="scan-text"
                    href={captura}
                    style={{ width: "100%" }}
                  >
                    Abrir e recortar
                  </Button>
                </div>
              </>
            ) : (
              <div className="lbb-source-origin" style={{ borderTop: 0, paddingTop: 10 }}>
                Nenhum arquivo anexado. Sem fonte não há o que recortar — capturar questões começa
                por aqui.
              </div>
            )}

            {book.capture && (
              <div className="lbb-source-progress">
                <div className="lbb-acervo-eyebrow" style={{ marginBottom: 0 }}>
                  Progresso de captura
                </div>
                <div className="lbb-source-bar">
                  <span className="lbb-bar" data-tone={book.capture.queued > 0 ? "warn" : undefined}>
                    <span style={{ width: `${book.capture.pct}%` }} />
                  </span>
                  <span className="lbb-source-size">{book.capture.label}</span>
                </div>
                {/*
                  O protótipo escreve "148 / ~410", com a estimativa por página do PDF. Não temos a
                  contagem de páginas guardada, e inventá-la seria ficção num lugar de decisão —
                  então o denominador é o número real de recortes feitos, e a linha abaixo diz até
                  onde o trabalho chegou de verdade.
                */}
                <span style={{ color: "var(--text-muted)", fontSize: "var(--text-body-sm)" }}>
                  {[book.reviewedRange, book.capture.lastPage ? `até a página ${book.capture.lastPage}` : null]
                    .filter(Boolean)
                    .join(" · ") || "nenhum capítulo revisado ainda"}
                </span>
              </div>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}

/** Verde só quando o capítulo está inteiro e certo; cinza quando está vazio; âmbar no resto. */
function toneDoCapitulo(capitulo: {
  questionCount: number;
  invalidCount: number;
}): "warn" | "neutral" | undefined {
  if (capitulo.questionCount === 0) return "neutral";
  if (capitulo.invalidCount > 0) return "warn";

  return undefined;
}
