"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button, EmptyState, Icon, MenuButton, type IconName } from "@/design-system";

import { useAcervoStyles } from "./acervo-styles";
import { AppShell } from "./app-shell";
import { CreateLibraryDialog } from "./create-library-dialog";
import { DeleteLibraryDialog, type DeleteLibraryTarget } from "./delete-library-dialog";

/**
 * Home — primeiro uso e uso recorrente na mesma tela (design §18 e §19).
 *
 * A ordem é a da pergunta que o usuário traz ao abrir: **onde eu parei**, depois **o que está
 * pendente**, e só então **o que mais existe**. Sem dashboard: número que não muda a próxima ação
 * é número que ocupa a primeira dobra sem pagar aluguel.
 *
 * Bibliotecas e livros aparecem em **linhas**, não em cards. Com quarenta bibliotecas — que é o
 * caso deste acervo — a grade vira um mosaico onde nada se destaca e a estatística não cabe; a
 * linha comporta nome, tamanho, quando e estado, que é o que decide onde entrar.
 */

export interface HomeLibraryRow {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly publicationCount: number;
  readonly questionCount: number;
  readonly invalidCount: number;
  /** Já formatado no servidor: formatar no cliente quebra a hidratação na virada do minuto. */
  readonly updatedLabel: string;
}

export interface HomeContinue {
  readonly questionId: string;
  readonly nodeId: string;
  readonly publicationId: string;
  readonly publicationTitle: string;
  readonly libraryName: string;
  /** "Capítulo 1 › Exercícios › Questão 27" — o caminho, não só o nó. */
  readonly path: string;
  /**
   * Já formatado — "há 18 min".
   *
   * O texto vem pronto do servidor de propósito. Formatá-lo aqui significaria chamar o relógio no
   * render do servidor **e** no da hidratação; nas viradas de minuto os dois discordam, o React
   * aborta a hidratação e a tela inteira para de responder — os botões viram enfeite. Tempo
   * relativo não depende de fuso, então não há nada a ganhar em adiar a conta para o cliente.
   */
  readonly updatedLabel: string;
  readonly volume: string | null;
  readonly chapterCount: number;
  readonly questionCount: number;
  readonly invalidCount: number;
  readonly sourceLabel: string | null;
}

export interface HomePending {
  readonly kind: "invalidas" | "captura" | "sem-questoes";
  readonly count: number;
  readonly title: string;
  readonly meta: string;
  readonly cta: string;
  readonly href: string;
}

export interface HomeRecent {
  readonly id: string;
  readonly title: string;
  readonly libraryName: string;
  readonly librarySlug: string;
  readonly questionCount: number;
  /** Já formatado no servidor — ver `HomeContinue.updatedLabel`. */
  readonly updatedLabel: string;
}

export interface HomeScreenProps {
  readonly libraries: readonly HomeLibraryRow[];
  readonly continueWhere: HomeContinue | null;
  readonly pending: readonly HomePending[];
  readonly recent: readonly HomeRecent[];
  /** "Boa tarde" — decidido no servidor, pelo mesmo motivo dos rótulos de tempo. */
  readonly greeting: string;
}

/** Cor e ícone de cada pendência. O read model manda o `kind`; layout é decisão daqui. */
const PENDING_LOOK: Readonly<
  Record<HomePending["kind"], { icon: IconName; fg: string; bg: string; bd: string }>
> = {
  invalidas: {
    icon: "triangle-alert",
    fg: "var(--danger-text)",
    bg: "var(--danger-surface)",
    bd: "var(--danger-border)",
  },
  captura: {
    icon: "scan-text",
    fg: "var(--warn-text)",
    bg: "var(--warn-surface)",
    bd: "var(--warn-border)",
  },
  "sem-questoes": {
    icon: "book-open",
    fg: "var(--accent-text)",
    bg: "var(--accent-surface)",
    bd: "var(--accent-border)",
  },
};

export function HomeScreen({
  libraries,
  continueWhere,
  pending,
  recent,
  greeting,
}: HomeScreenProps) {
  useAcervoStyles();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<DeleteLibraryTarget | null>(null);

  const resumeHref = continueWhere
    ? `/publications/${continueWhere.publicationId}/editor?node=${continueWhere.nodeId}`
    : null;

  /**
   * `Ctrl+Shift+O` retoma de onde parou.
   *
   * O atalho está escrito na faixa do cartão, e atalho anunciado que não funciona é pior que
   * atalho ausente. `Shift` no meio para não colidir com o "abrir arquivo" que o navegador já
   * reserva em `Ctrl+O`.
   */
  useEffect(() => {
    if (!resumeHref) return;

    const onKey = (event: KeyboardEvent) => {
      if (!event.ctrlKey || !event.shiftKey || event.key.toLowerCase() !== "o") return;
      event.preventDefault();
      router.push(resumeHref);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [resumeHref, router]);

  return (
    <AppShell
      activeModule="inicio"
      breadcrumb={[{ label: "Início" }]}
      actions={
        <Button size="sm" variant="primary" icon="plus" onClick={() => setCreating(true)}>
          Criar biblioteca
        </Button>
      }
      /*
        Só o que é da Home. `local-first · SQLite` passou a ser do `AppShell`, que o põe em toda
        tela — repeti-lo aqui pintava "local-first · SQLite   SQLite · local" na mesma barra.
      */
      statusLeft={
        <span>
          {libraries.length} {libraries.length === 1 ? "biblioteca" : "bibliotecas"}
        </span>
      }
    >
      <div className="lbb-acervo">
        {libraries.length === 0 ? (
          <FirstUse onCreate={() => setCreating(true)} />
        ) : (
          <>
            <div>
              <div className="lbb-greet">Continuar trabalhando</div>
              <h1 className="lbb-greet-title">{greeting}.</h1>
            </div>

            {continueWhere && resumeHref && (
              <ContinueCard where={continueWhere} href={resumeHref} />
            )}

            {pending.length > 0 && (
              <section className="lbb-acervo-section">
                <div className="lbb-section-head">
                  <h2>Pendências relevantes</h2>
                  <span className="lbb-section-count">
                    {pending.length} {pending.length === 1 ? "grupo" : "grupos"}
                  </span>
                </div>
                <div className="lbb-rowlist">
                  {pending.map((row) => {
                    const look = PENDING_LOOK[row.kind];
                    return (
                      <Link key={row.kind} className="lbb-row" href={row.href}>
                        <span
                          className="lbb-row-tile"
                          style={{ background: look.bg, color: look.fg, border: `1px solid ${look.bd}` }}
                        >
                          <Icon name={look.icon} size={14} />
                        </span>
                        <span className="lbb-row-count" style={{ color: look.fg }}>
                          {row.count}
                        </span>
                        <span className="lbb-row-body">
                          <span className="lbb-row-title">{row.title}</span>
                          <span className="lbb-row-meta">{row.meta}</span>
                        </span>
                        <span className="lbb-row-cta">
                          {row.cta}
                          <Icon name="arrow-right" size={13} />
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            <section className="lbb-acervo-section">
              <div className="lbb-section-head">
                <h2>Bibliotecas</h2>
                <Link
                  href="/bibliotecas"
                  style={{ fontSize: "var(--text-body-sm)", fontWeight: "var(--weight-medium)" }}
                >
                  ver todas
                </Link>
                <span className="lbb-section-spacer" />
                <Button size="sm" variant="secondary" icon="plus" onClick={() => setCreating(true)}>
                  Nova biblioteca
                </Button>
              </div>
              <div className="lbb-rowlist">
                {libraries.slice(0, 8).map((library) => (
                  <LibraryRow
                    key={library.id}
                    library={library}
                    onDelete={() => setDeleting({ id: library.id, name: library.name })}
                  />
                ))}
              </div>
              {libraries.length > 8 && (
                <div style={{ marginTop: "var(--space-2)" }}>
                  <Link href="/bibliotecas" className="lbb-card-meta">
                    e mais {libraries.length - 8} — ver todas
                  </Link>
                </div>
              )}
            </section>

            {recent.length > 0 && (
              <section className="lbb-acervo-section">
                <div className="lbb-section-head">
                  <h2>Livros recentes</h2>
                  <span className="lbb-section-spacer" />
                  <Link
                    href="/publicacoes"
                    style={{ fontSize: "var(--text-body-sm)", fontWeight: "var(--weight-medium)" }}
                  >
                    ver todos
                  </Link>
                </div>
                <div className="lbb-rowlist">
                  {recent.map((entry) => (
                    <Link key={entry.id} className="lbb-row" href={`/publications/${entry.id}`}>
                      <Icon name="book-open" size={16} />
                      <span className="lbb-row-body">
                        <span className="lbb-row-title">{entry.title}</span>
                        <span className="lbb-row-meta">
                          {entry.libraryName} · {entry.questionCount}{" "}
                          {entry.questionCount === 1 ? "questão" : "questões"}
                        </span>
                      </span>
                      <span className="lbb-row-when">{entry.updatedLabel}</span>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      <CreateLibraryDialog open={creating} onClose={() => setCreating(false)} />
      <DeleteLibraryDialog target={deleting} onClose={() => setDeleting(null)} />
    </AppShell>
  );
}

/**
 * O cartão de retomada.
 *
 * A faixa de rodapé é o que separa este cartão de um atalho: ela diz o **tamanho** do que está
 * aberto — capítulos, questões, quantas ainda não passaram na validação. É a informação que decide
 * se a próxima meia hora é de produzir ou de revisar.
 */
function ContinueCard({ where, href }: { readonly where: HomeContinue; readonly href: string }) {
  const partes = where.path.split(" › ");
  const folha = partes[partes.length - 1] ?? "";
  const galhos = partes.slice(0, -1);

  return (
    <section className="lbb-continue">
      <div className="lbb-continue-main">
        <div className="lbb-cover" aria-hidden>
          <span className="lbb-cover-title">{where.publicationTitle}</span>
          {where.volume && <span className="lbb-cover-vol">{where.volume}</span>}
        </div>

        <div className="lbb-continue-body">
          <div className="lbb-continue-when">
            <span>última sessão · {where.updatedLabel}</span>
            <span className="lbb-dot" />
            {/* Verdadeiro por construção: o editor salva sozinho, e daqui não há edição pendente. */}
            <span>tudo salvo</span>
          </div>

          <h2 className="lbb-continue-title">{where.publicationTitle}</h2>

          <div className="lbb-continue-path" title={where.path}>
            {galhos.map((parte, i) => (
              <span key={`${parte}-${i}`} style={{ display: "contents" }}>
                <span>{parte}</span>
                <Icon name="chevron-right" size={12} />
              </span>
            ))}
            <span className="lbb-continue-leaf">{folha}</span>
          </div>

          <div className="lbb-continue-actions">
            <Button variant="primary" icon="pencil" href={href}>
              Continuar no editor
            </Button>
            <Button
              variant="secondary"
              icon="scan-text"
              href={`/publications/${where.publicationId}/ingestao`}
            >
              Capturar questões
            </Button>
            <Button
              variant="secondary"
              icon="book-open"
              href={`/publications/${where.publicationId}`}
            >
              Ver o livro
            </Button>
          </div>
        </div>
      </div>

      <div className="lbb-continue-foot">
        {where.sourceLabel && <span>{where.sourceLabel}</span>}
        <span>capítulos {where.chapterCount}</span>
        <span>questões {where.questionCount}</span>
        {where.invalidCount > 0 && <span data-tone="warn">não validadas {where.invalidCount}</span>}
        <span className="lbb-kbd">retomar: Ctrl+Shift+O</span>
      </div>
    </section>
  );
}

function LibraryRow({
  library,
  onDelete,
}: {
  readonly library: HomeLibraryRow;
  readonly onDelete: () => void;
}) {
  const emDia = library.invalidCount === 0;

  return (
    <div className="lbb-row" style={{ padding: 0 }}>
      <Link
        className="lbb-row"
        href={`/bibliotecas/${library.slug}`}
        style={{ border: 0, flex: 1, minWidth: 0 }}
      >
        <Icon name="library" size={16} />
        <span className="lbb-row-body">
          <span className="lbb-row-title">{library.name}</span>
          <span className="lbb-row-stats">
            {library.publicationCount} {library.publicationCount === 1 ? "livro" : "livros"} ·{" "}
            {library.questionCount} {library.questionCount === 1 ? "questão" : "questões"}
          </span>
        </span>
        <span className="lbb-row-when">{library.updatedLabel}</span>
        <span className="lbb-pill" data-tone={emDia ? "neutral" : "warn"}>
          {emDia ? "em dia" : `${library.invalidCount} a revisar`}
        </span>
      </Link>
      <span className="lbb-row-actions" style={{ paddingRight: "var(--space-3)" }}>
        <MenuButton
          aria-label={`Ações da biblioteca ${library.name}`}
          groups={[
            [{ id: "delete", label: "Excluir", icon: "circle-x", tone: "danger", onSelect: onDelete }],
          ]}
        />
      </span>
    </div>
  );
}

/**
 * Primeiro acesso (design §18).
 *
 * Sem dashboard vazio: três frases sobre onde o acervo vive, e os caminhos que existem de verdade.
 * O protótipo oferece “Conectar Calibre” aqui; sem nenhuma biblioteca não há destino para onde
 * levar o livro importado, e botão que não leva a lugar nenhum é pior que botão ausente (§81) —
 * o Calibre aparece assim que a primeira biblioteca existir.
 */
function FirstUse({ onCreate }: { readonly onCreate: () => void }) {
  return (
    <div style={{ display: "grid", placeItems: "center", padding: "var(--space-8) 0" }}>
      <div style={{ maxWidth: "38rem", textAlign: "center" }}>
        <div
          style={{
            width: 64,
            height: 84,
            margin: "0 auto var(--space-5)",
            border: "1px solid var(--border-default)",
            borderRadius: 3,
            background: "var(--surface-paper)",
            boxShadow: "var(--shadow-md)",
            display: "grid",
            placeItems: "center",
            color: "var(--accent)",
          }}
        >
          <Icon name="library" size={26} />
        </div>

        <div className="lbb-greet">Primeiro acesso</div>
        <h1 className="lbb-greet-title" style={{ fontSize: "var(--text-display)" }}>
          Comece seu acervo
        </h1>
        <p
          style={{
            margin: "var(--space-2) auto 0",
            maxWidth: "29rem",
            color: "var(--text-secondary)",
            textWrap: "pretty",
          }}
        >
          Uma biblioteca guarda seus livros. Dentro de cada livro você organiza capítulos e cria
          questões — digitando ou recortando de um PDF.
        </p>

        <div style={{ display: "flex", justifyContent: "center", gap: "var(--space-2)", marginTop: "var(--space-6)" }}>
          <Button variant="primary" icon="plus" onClick={onCreate}>
            Criar biblioteca
          </Button>
          <Button variant="secondary" icon="download-cloud" href="/importar">
            Importar biblioteca (.lbb)
          </Button>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "var(--space-5)",
            flexWrap: "wrap",
            marginTop: "var(--space-8)",
            paddingTop: "var(--space-4)",
            borderTop: "1px solid var(--border-subtle)",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-meta)",
            color: "var(--text-muted)",
          }}
        >
          <span>fica no seu computador</span>
          <span>funciona offline</span>
          <span>exporta quando quiser</span>
        </div>

        <div style={{ marginTop: "var(--space-6)" }}>
          <EmptyState
            icon="library"
            title="Nenhuma biblioteca ainda"
            description="O acervo começa vazio de propósito — sem seed, sem demonstração. O primeiro livro entra depois da primeira biblioteca."
          />
        </div>
      </div>
    </div>
  );
}
