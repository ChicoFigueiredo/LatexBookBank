"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, EmptyState, Icon, IconButton, MenuButton, Modal, type IconName } from "@/design-system";

import { DeleteBookDialog } from "../../delete-book-dialog";
import { useAcervoStyles } from "../../acervo-styles";
import { AppShell } from "../../app-shell";

/**
 * Uma biblioteca aberta: os livros dentro dela e o caminho para acrescentar o próximo.
 *
 * Os livros vêm em **tabela**, não em cards (protótipo, 457–482). A pergunta que se faz aqui é
 * comparativa — qual tem questão pendente, qual está parado, qual foi mexido hoje —, e comparar
 * exige coluna alinhada. Card empilha os mesmos dados sem alinhar nenhum.
 *
 * "Adicionar livro" abre as origens do design (§5 dos ajustes finais), cada uma com o que faz.
 */

export type ShelfState = "sem-questoes" | "a-revisar" | "em-captura" | "pronto";

export interface ShelfBook {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string | null;
  /** Como o usuário chama o livro — "FME 3". Procura-se por ele antes que pelo título da capa. */
  readonly nickname: string | null;
  readonly mark: string;
  readonly authors: string | null;
  readonly edition: string | null;
  readonly questionCount: number;
  readonly invalidCount: number;
  readonly state: ShelfState;
  /** Já formatado no servidor: formatar no cliente quebra a hidratação na virada do minuto. */
  readonly updatedLabel: string;
}

export interface LibraryScreenProps {
  readonly library: {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
    readonly description: string | null;
  };
  readonly books: readonly ShelfBook[];
  readonly questionTotal: number;
  readonly lastActivityLabel: string | null;
  /** Vem de `?adicionar=1` — o diálogo de criação manda a biblioteca abrir já perguntando. */
  readonly addOnMount?: boolean;
}

/** Rótulo, tom e ícone de cada estado. Semântica vem do read model; aparência é decisão daqui. */
const STATE_LOOK: Readonly<
  Record<ShelfState, { label: string; tone: "ok" | "warn" | "neutral"; icon: IconName }>
> = {
  pronto: { label: "pronto", tone: "ok", icon: "circle-check" },
  "a-revisar": { label: "a revisar", tone: "warn", icon: "triangle-alert" },
  "em-captura": { label: "em captura", tone: "warn", icon: "scan-text" },
  "sem-questoes": { label: "sem questões", tone: "neutral", icon: "circle-help" },
};

export function LibraryScreen({
  library,
  books,
  questionTotal,
  lastActivityLabel,
  addOnMount = false,
}: LibraryScreenProps) {
  useAcervoStyles();
  const [adding, setAdding] = useState(addOnMount);
  const [filtro, setFiltro] = useState("");
  /**
   * O livro cuja exclusão está sendo confirmada.
   *
   * Antes desta rodada **não havia como excluir um livro** — dava para apagar a biblioteca inteira
   * e dava para mandar nó e questão para a lixeira, e um livro importado por engano ficava no
   * acervo para sempre.
   */
  const [excluindo, setExcluindo] = useState<ShelfBook | null>(null);

  const alvo = filtro.trim().toLowerCase();
  const visiveis = alvo
    ? books.filter((book) =>
        [book.title, book.nickname, book.subtitle, book.authors, book.edition]
          .filter((campo): campo is string => campo !== null)
          .some((campo) => campo.toLowerCase().includes(alvo)),
      )
    : books;

  return (
    <AppShell
      activeModule="bibliotecas"
      breadcrumb={[{ label: "Bibliotecas", href: "/bibliotecas" }, { label: library.name }]}
      actions={
        <>
          <Button size="sm" variant="primary" icon="plus" onClick={() => setAdding(true)}>
            Adicionar livro
          </Button>
          {/* Exportar é ação de biblioteca inteira, e o protótipo a põe aqui, ao lado do que a
              preenche — não escondida em "Importar / exportar". */}
          <IconButton
            icon="download-cloud"
            aria-label={`Exportar “${library.name}” como .lbb`}
            variant="outline"
            size="sm"
            onClick={() => {
              // Download de arquivo, não navegação de página: a rota devolve `Content-Disposition`
              // e o roteador do Next não tem o que fazer com isso. A regra de lint não distingue
              // uma coisa da outra pelo caminho.
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination
              window.location.href = `/api/workspaces/export?workspaceId=${library.id}`;
            }}
          />
        </>
      }
    >
      <div className="lbb-acervo">
        <div>
          <div className="lbb-greet">Biblioteca</div>
          <h1 className="lbb-greet-title">{library.name}</h1>
          <div className="lbb-card-meta" style={{ marginTop: 4 }}>
            {[
              `${books.length} ${books.length === 1 ? "livro" : "livros"}`,
              `${questionTotal} ${questionTotal === 1 ? "questão" : "questões"}`,
              lastActivityLabel ? `última atividade ${lastActivityLabel}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>

        {library.description && (
          <p style={{ margin: "var(--space-3) 0 0", maxWidth: "56ch", color: "var(--text-secondary)" }}>
            {library.description}
          </p>
        )}

        {books.length === 0 ? (
          <div style={{ marginTop: "var(--space-6)" }}>
            <EmptyState
              icon="book-open"
              title="Biblioteca criada — falta o primeiro livro"
              description="Cadastre um livro à mão, importe do Calibre ou traga um arquivo. Dá para começar só com o título."
              action={
                <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>
                  Adicionar primeiro livro
                </Button>
              }
            />
          </div>
        ) : (
          <>
            <div className="lbb-filterbar">
              <div className="lbb-search">
                <Icon name="search" size={14} />
                <input
                  type="text"
                  value={filtro}
                  placeholder="Filtrar por título, autor, edição…"
                  aria-label="Filtrar os livros"
                  onChange={(event) => setFiltro(event.target.value)}
                />
              </div>
              <span className="lbb-section-spacer" />
              <span className="lbb-section-count">
                {visiveis.length === books.length
                  ? `${books.length} ${books.length === 1 ? "livro" : "livros"}`
                  : `${visiveis.length} de ${books.length}`}
              </span>
            </div>

            {visiveis.length === 0 ? (
              <div style={{ marginTop: "var(--space-5)" }}>
                <EmptyState
                  icon="search"
                  title={`Nenhum livro casa com “${filtro.trim()}”`}
                  description="O filtro olha título, apelido, subtítulo, autor e edição."
                  action={
                    <Button variant="secondary" onClick={() => setFiltro("")}>
                      Limpar filtro
                    </Button>
                  }
                />
              </div>
            ) : (
              <>
                <div className="lbb-shelf" role="table" aria-label={`Livros de ${library.name}`}>
                  <div className="lbb-shelf-row lbb-shelf-head" role="row">
                    <span />
                    <span role="columnheader">Título</span>
                    <span role="columnheader" data-col="autor">
                      Autor
                    </span>
                    <span role="columnheader" data-col="edicao">
                      Edição
                    </span>
                    <span role="columnheader" style={{ textAlign: "right" }}>
                      Questões
                    </span>
                    <span role="columnheader">Estado</span>
                    <span role="columnheader">Última edição</span>
                    <span />
                  </div>

                  {visiveis.map((book) => (
                    <ShelfRow key={book.id} book={book} onDelete={setExcluindo} />
                  ))}
                </div>

                <div className="lbb-shelf-hint">
                  <Icon name="circle-help" size={13} />
                  <span>
                    Clique num livro para abrir o resumo — de lá se vai para o editor ou para a
                    captura.
                  </span>
                </div>
              </>
            )}
          </>
        )}
      </div>

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        eyebrow="ADICIONAR LIVRO"
        title="De onde vem este livro?"
      >
        {/*
          Cada origem diz o que faz. Sem a frase, "Importar do Calibre" e "Importar arquivo .lbb"
          parecem a mesma operação com arquivos diferentes — e são coisas distintas: uma cria um
          livro, a outra despeja um acervo inteiro.
        */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <Origem
            href={`/bibliotecas/${library.slug}/livros/calibre`}
            icon="library"
            title="Importar do Calibre"
            desc="Absorve metadados, capa e o arquivo-fonte de um livro já catalogado."
          />
          <Origem
            href={`/bibliotecas/${library.slug}/livros/novo`}
            icon="pencil"
            title="Cadastrar manualmente"
            desc="Título, autor e editora agora; ISBN, série e capa quando você quiser."
          />
          {/*
            A quarta origem do protótipo (2431–2481). Ela e "Importar acervo .lbb" pareciam a
            mesma coisa enquanto nenhuma das duas dizia o que fazia: uma cria **um** livro a partir
            de um arquivo, a outra despeja um acervo inteiro e não cria livro nenhum.
          */}
          <Origem
            href={`/bibliotecas/${library.slug}/livros/novo?fonte=arquivo`}
            icon="file-text"
            title="A partir de um arquivo"
            desc="PDF, imagem ou EPUB como fonte editorial de um livro novo."
          />
          <Origem
            href="/importar"
            icon="download-cloud"
            title="Importar acervo .lbb"
            desc="Traz bibliotecas, livros e questões já estruturados — não cria um livro novo."
          />
        </div>
      </Modal>

      <DeleteBookDialog
        target={excluindo ? { id: excluindo.id, title: excluindo.title } : null}
        onClose={() => setExcluindo(null)}
        // A estante é Server Component acima: sem o refresh, a linha excluída continuaria na tela
        // até alguém recarregar — e o `router.refresh` do próprio diálogo já cuida disso.
        onDeleted={() => setExcluindo(null)}
      />
    </AppShell>
  );
}

function ShelfRow({
  book,
  onDelete,
}: {
  readonly book: ShelfBook;
  readonly onDelete: (book: ShelfBook) => void;
}) {
  const router = useRouter();
  const look = STATE_LOOK[book.state];

  return (
    <Link className="lbb-shelf-row" href={`/publications/${book.id}`} role="row">
      <span className="lbb-shelf-mark" aria-hidden>
        {book.mark}
      </span>

      <span style={{ minWidth: 0 }} role="cell">
        <span className="lbb-shelf-title">
          {book.title}
          {/*
            O apelido em mono ao lado do título, e não no lugar dele: quem procura "FME 3" precisa
            achá-lo, e quem não conhece o apelido precisa continuar reconhecendo a capa.
          */}
          {book.nickname && <span className="lbb-shelf-nick">{book.nickname}</span>}
        </span>
        {book.subtitle && <span className="lbb-shelf-sub">{book.subtitle}</span>}
      </span>

      <span className="lbb-shelf-cell" data-col="autor" role="cell">
        {book.authors ?? "—"}
      </span>
      <span className="lbb-shelf-cell" data-col="edicao" role="cell">
        {book.edition ?? "—"}
      </span>
      <span className="lbb-shelf-num" role="cell">
        {book.questionCount}
      </span>

      <span role="cell">
        <span className="lbb-pill lbb-pill-icon" data-tone={look.tone}>
          <Icon name={look.icon} size={11} />
          {/* A contagem entra no rótulo: "a revisar" sem número não diz se é uma ou quarenta. */}
          {book.state === "a-revisar" ? `${book.invalidCount} a revisar` : look.label}
        </span>
      </span>

      <span className="lbb-shelf-cell" role="cell">
        {book.updatedLabel}
      </span>

      {/*
        O menu fica fora do fluxo do link, no fim da linha. Botão dentro de âncora é HTML inválido
        e o clique navega antes de o menu abrir — foi o mesmo cuidado do card de biblioteca.
      */}
      <span onClick={(event) => event.preventDefault()} role="cell">
        <MenuButton
          aria-label={`Ações do livro ${book.title}`}
          groups={[
            [
              {
                id: "editor",
                label: "Abrir no editor",
                icon: "pencil",
                onSelect: () => router.push(`/publications/${book.id}/editor`),
              },
              {
                id: "captura",
                label: "Capturar questões",
                icon: "scan-text",
                onSelect: () => router.push(`/publications/${book.id}/ingestao`),
              },
            ],
            [
              {
                id: "excluir",
                label: "Excluir livro",
                icon: "x",
                tone: "danger",
                // Em grupo separado, e por último: o menu do protótipo termina em `Excluir`, e
                // separar é o que impede o clique de inércia depois de "Capturar questões".
                onSelect: () => onDelete(book),
              },
            ],
          ]}
        />
      </span>
    </Link>
  );
}

function Origem({
  href,
  icon,
  title,
  desc,
}: {
  readonly href: string;
  readonly icon: IconName;
  readonly title: string;
  readonly desc: string;
}) {
  return (
    <Link className="lbb-pick" href={href}>
      <span className="lbb-pick-icon">
        <Icon name={icon} size={14} />
      </span>
      <span className="lbb-pick-body">
        <span className="lbb-pick-title">{title}</span>
        <span className="lbb-pick-desc">{desc}</span>
      </span>
    </Link>
  );
}
