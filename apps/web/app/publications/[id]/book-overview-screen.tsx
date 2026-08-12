"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Banner, Button, Icon, type IconName } from "@/design-system";

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
    readonly isEmpty: boolean;
    /** "Livro criado agora" — só enquanto for verdade. Resolvido no servidor. */
    readonly justCreated: boolean;
  };
}

export function BookOverviewScreen({ book }: BookOverviewScreenProps) {
  useAcervoStyles();
  const router = useRouter();

  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const editor = `/publications/${book.id}/editor`;
  const captura = `/publications/${book.id}/ingestao`;

  /**
   * "Criar primeiro capítulo" **cria** o capítulo.
   *
   * O caminho fácil seria mandar para o editor e deixar a pessoa achar o menu de adicionar. Mas o
   * botão promete um capítulo, e quem clica nele está no primeiro minuto do livro — é exatamente
   * quem ainda não sabe onde fica o menu. O capítulo nasce aqui e o editor abre nele.
   */
  const criarPrimeiroCapitulo = async () => {
    setCriando(true);
    setErro(null);

    try {
      const response = await fetch(`/api/publications/${book.id}/nodes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "CHAPTER",
          title: "Capítulo 1",
          placement: { kind: "lastChild", parentId: null },
        }),
      });

      const payload = (await response.json()) as { id?: string; message?: string };
      if (!response.ok || !payload.id) {
        setErro(payload.message ?? "Não deu para criar o capítulo.");
        return;
      }

      router.push(`${editor}?node=${payload.id}`);
    } catch {
      setErro("Não deu para falar com o servidor.");
    } finally {
      setCriando(false);
    }
  };

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
            {/* "Livro criado agora" em tom ok, e só enquanto for verdade (protótipo, 609). É o
                reconhecimento do gesto que acabou de acontecer — passados alguns minutos vira
                ruído, e volta a ser o endereço do livro. */}
            <div className="lbb-greet" data-tone={book.justCreated ? "ok" : undefined}>
              {book.justCreated ? "Livro criado agora" : `Publicação · ${book.libraryName}`}
            </div>
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

            {/* No livro vazio a linha de ações some: as escolhas dele são outras, e ficam no
                centro da tela em vez de repartidas entre dois lugares. */}
            {!book.isEmpty && (
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
            )}
          </div>
        </div>

        {/*
          No livro vazio a faixa some. Ela diria "o livro ainda não tem questão nenhuma" e "sem
          fonte anexada" logo acima de uma tela inteira dedicada a dizer as duas coisas — repetir
          o aviso a dois centímetros de si mesmo é como uma tela ensina a não ler avisos. O
          protótipo também não a tem neste estado.
        */}
        {!book.isEmpty && book.issues.length > 0 && (
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

        {erro && (
          <div style={{ marginTop: "var(--space-4)" }}>
            <Banner tone="danger" title="Não deu" onDismiss={() => setErro(null)}>
              {erro}
            </Banner>
          </div>
        )}

        {/*
          `LIVRO · vazio` (protótipo, 601–642) — uma tela diferente, e não a mesma com menos coisa.
          Um livro cheio responde "o que falta aqui?"; um livro vazio responde "por onde começo?",
          e uma grade de estrutura vazia ao lado da caixa de fonte responde à primeira com silêncio.
        */}
        {book.isEmpty ? (
          <div className="lbb-book-empty">
            <div className="lbb-book-empty-icon" aria-hidden>
              <Icon name="list-tree" size={20} />
            </div>
            <h2>Este livro ainda não tem capítulos nem questões</h2>
            <p>
              Você pode montar a estrutura primeiro ou já começar recortando questões do PDF — nesse
              caso o recorte cria o capítulo que recebe a primeira.
            </p>

            <div className="lbb-book-empty-actions">
              <Button variant="primary" icon="scan-text" href={captura}>
                Capturar primeira questão
              </Button>
              {/*
                Este cria o capítulo de verdade. Mandar para o editor e deixar a pessoa achar o
                menu seria oferecer um botão que promete um capítulo e entrega uma tela.
              */}
              <Button
                variant="secondary"
                icon="plus"
                loading={criando}
                onClick={() => void criarPrimeiroCapitulo()}
              >
                Criar primeiro capítulo
              </Button>
              {book.source && (
                <Button variant="secondary" icon="file-text" href={captura}>
                  Abrir PDF fonte
                </Button>
              )}
            </div>

            {/*
              O protótipo tem uma quarta ação — `Importar estrutura` — e a linha "o sumário do PDF
              pode virar capítulos automaticamente". **Não existe leitura de sumário neste app.**
              Um botão que abre um "em breve" é pior que botão ausente (§81), e a frase seria pior
              ainda: prometeria trabalho automático a quem está decidindo se faz o trabalho à mão.
            */}
            <span className="lbb-book-empty-foot">
              {book.source
                ? "a captura por recorte já tem de onde partir — a fonte está anexada"
                : "sem fonte anexada ainda: dá para montar a estrutura à mão e anexar depois"}
            </span>
          </div>
        ) : (
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
        )}
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
