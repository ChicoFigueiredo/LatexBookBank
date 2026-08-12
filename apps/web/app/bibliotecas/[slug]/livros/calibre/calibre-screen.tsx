"use client";

import { useState } from "react";

import {
  Badge,
  Banner,
  Button,
  Callout,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Segmented,
  Select,
  useStoredState,
} from "@/design-system";

import { useAcervoStyles } from "../../../../acervo-styles";
import { AppShell } from "../../../../app-shell";

/**
 * Importar do Calibre — a jornada da §30.
 *
 * ```text
 * apontar a pasta → catálogo → pesquisar → selecionar → revisar → importar → abrir
 * ```
 *
 * Depois de importado, o livro é um livro normal do LatexBookBank (design §17): o Calibre aparece
 * só como origem, guardada em `metadataJson`. Nada da tela sugere que ele continue sendo "um livro
 * do Calibre".
 *
 * O caminho fica em `localStorage` porque ninguém quer digitá-lo de novo a cada importação — e
 * porque ele é **preferência de máquina**, não dado do acervo (§65).
 */

interface CatalogEntry {
  readonly externalId: string;
  readonly title: string;
  readonly authors: readonly string[];
  readonly publisher: string | null;
  readonly year: number | null;
  readonly isbn: string | null;
  readonly series: string | null;
  readonly seriesIndex: string | null;
  readonly files: readonly { readonly format: string; readonly sizeBytes: number }[];
  readonly hasCover: boolean;
  readonly duplicate: "external-id" | "isbn" | "title-and-author" | null;
}

interface Summary {
  readonly bookCount: number;
  readonly formats: Readonly<Record<string, number>>;
}

const DUPLICATE_LABEL: Readonly<Record<string, string>> = {
  "external-id": "já importado",
  isbn: "ISBN já no acervo",
  "title-and-author": "título parecido",
};

const mb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024 / 1024))} MB`;

export function CalibreScreen({
  library,
}: {
  readonly library: { readonly id: string; readonly name: string; readonly slug: string };
}) {
  useAcervoStyles();

  const [root, setRoot] = useStoredState("lbb:calibre:root", "");
  const [query, setQuery] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [entries, setEntries] = useState<readonly CatalogEntry[] | null>(null);
  const [selected, setSelected] = useState<CatalogEntry | null>(null);
  /**
   * Filtros do protótipo (2500–2515), e os dois respondem a perguntas que a lista não responde.
   *
   * **Formato**: a tela já diz, linha a linha, que sem PDF a captura por recorte não funciona.
   * Numa biblioteca de 64 livros — o tamanho da do usuário, medido na spike — descobrir quais
   * servem exige varrer as 64. O filtro responde de uma vez.
   *
   * **Série**: `series` e `seriesIndex` vêm do Calibre desde sempre e **nunca apareceram na
   * tela**. Uma coleção como "Fundamentos de Matemática Elementar" tem dez volumes, e é por
   * coleção que se procura quando se está trazendo uma delas para o acervo.
   *
   * Do lado do cliente, sobre o que já foi carregado: a busca por texto é do servidor porque o
   * catálogo pode ter milhares de linhas; estreitar o que já está na tela não vale outra viagem.
   */
  const [formato, setFormato] = useState("todos");
  const [serie, setSerie] = useState("todas");

  // Derivados do que veio, e não de uma lista fixa: catálogo sem EPUB não mostra o botão EPUB, e
  // catálogo sem coleção nenhuma não mostra o seletor de série. Filtro que só tem uma resposta é
  // um controle ensinando a pessoa a ignorar controles.
  const formatosDisponiveis = [
    ...new Set((entries ?? []).flatMap((entry) => entry.files.map((file) => file.format))),
  ].sort();

  const series = [
    ...new Set(
      (entries ?? [])
        .map((entry) => entry.series?.trim())
        .filter((nome): nome is string => !!nome),
    ),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));

  const visiveis = (entries ?? []).filter((entry) => {
    const temFormato =
      formato === "todos" || entry.files.some((file) => file.format === formato);
    const daSerie = serie === "todas" || entry.series?.trim() === serie;

    return temFormato && daSerie;
  });

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [duplicate, setDuplicate] = useState<{ message: string; publicationId: string } | null>(
    null,
  );
  const [done, setDone] = useState<{ href: string; warnings: readonly string[] } | null>(null);

  const abrir = async (texto = query) => {
    setBusy(true);
    setError(null);
    setDone(null);

    try {
      const response = await fetch("/api/catalog", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: root, libraryId: library.id, query: texto }),
      });
      const payload = (await response.json()) as {
        summary?: Summary;
        entries?: CatalogEntry[];
        message?: string;
      };

      if (!response.ok) {
        setError(payload.message ?? "Não deu para abrir o catálogo.");
        setEntries(null);
        return;
      }

      setSummary(payload.summary ?? null);
      setEntries(payload.entries ?? []);
    } catch {
      setError("Não deu para falar com o servidor.");
    } finally {
      setBusy(false);
    }
  };

  const importar = async (force = false) => {
    if (selected === null) return;

    setBusy(true);
    setError(null);
    setDuplicate(null);

    try {
      const response = await fetch("/api/catalog/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          path: root,
          libraryId: library.id,
          externalId: selected.externalId,
          force,
        }),
      });
      const payload = (await response.json()) as {
        href?: string;
        warnings?: string[];
        message?: string;
        publicationId?: string;
      };

      if (response.status === 409 && payload.publicationId) {
        // Duplicata bloqueante vira **escolha**, não parede: o usuário pode abrir o que já existe
        // ou importar assim mesmo, e os dois são legítimos.
        setDuplicate({
          message: payload.message ?? "Este livro já está no acervo.",
          publicationId: payload.publicationId,
        });
        return;
      }

      if (!response.ok || !payload.href) {
        setError(payload.message ?? "Não deu para importar.");
        return;
      }

      setDone({ href: payload.href, warnings: payload.warnings ?? [] });
    } catch {
      setError("Não deu para falar com o servidor.");
    } finally {
      setBusy(false);
    }
  };

  const breadcrumb = [
    { label: "Bibliotecas", href: "/bibliotecas" },
    { label: library.name, href: `/bibliotecas/${library.slug}` },
    { label: "Calibre" },
  ];

  if (done) {
    return (
      <AppShell activeModule="bibliotecas" breadcrumb={breadcrumb}>
        <div className="lbb-acervo">
          <PageHeader eyebrow="IMPORTADO DO CALIBRE" title={selected?.title ?? "Livro importado"} />
          <Callout tone="ok" title="Livro no acervo">
            O PDF e a capa foram copiados para o storage do LatexBookBank — o livro continua
            inteiro aqui mesmo que a pasta do Calibre mude de lugar.
            {done.warnings.length > 0 && (
              <ul style={{ margin: "8px 0 0", paddingLeft: "1.2rem" }}>
                {done.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
          </Callout>

          <div className="lbb-acervo-actions">
            <Button variant="primary" icon="book-open" href={done.href}>
              Abrir o livro
            </Button>
            <Button
              variant="secondary"
              icon="library"
              onClick={() => {
                setDone(null);
                setSelected(null);
              }}
            >
              Importar outro
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell activeModule="bibliotecas" breadcrumb={breadcrumb}>
      <div className="lbb-acervo">
        <PageHeader
          eyebrow="IMPORTAR DO CALIBRE"
          title={library.name}
          meta="Aponte a pasta da biblioteca — a que tem o arquivo metadata.db dentro."
        />

        {error && (
          <Banner tone="danger" title="Não deu certo" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        )}

        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-end" }}>
          <div style={{ flex: 1, maxWidth: "34rem" }}>
            <Field label="Pasta da biblioteca" hint="Caminho completo. Ex.: /mnt/u/Calibre">
              <Input
                value={root}
                placeholder="/caminho/para/Calibre"
                onChange={(event) => setRoot(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && root.trim() !== "") void abrir();
                }}
              />
            </Field>
          </div>
          <Button
            variant="primary"
            loading={busy && entries === null}
            disabled={root.trim() === ""}
            onClick={() => void abrir()}
          >
            Abrir catálogo
          </Button>
        </div>

        {summary && (
          <div style={{ marginTop: "var(--space-4)", display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Badge tone="neutral" mono>
              {summary.bookCount} livros
            </Badge>
            {Object.entries(summary.formats).map(([format, total]) => (
              <Badge key={format} tone={format === "PDF" ? "info" : "neutral"} mono>
                {total} {format}
              </Badge>
            ))}
          </div>
        )}

        {entries && (
          <>
            <div className="lbb-filterbar" style={{ flexWrap: "wrap" }}>
              <div style={{ maxWidth: "22rem", flex: "1 1 16rem" }}>
                <Input
                  size="sm"
                  placeholder="Pesquisar por título ou autor…"
                  aria-label="Pesquisar no catálogo"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void abrir(query);
                  }}
                />
              </div>

              {formatosDisponiveis.length > 1 && (
                <Segmented
                  aria-label="Filtrar por formato"
                  value={formato}
                  onChange={setFormato}
                  options={[
                    { id: "todos", label: "Todos" },
                    ...formatosDisponiveis.map((f) => ({ id: f, label: f })),
                  ]}
                />
              )}

              {series.length > 0 && (
                <Select
                  size="sm"
                  aria-label="Filtrar por série"
                  value={serie}
                  onChange={(event) => setSerie(event.target.value)}
                >
                  <option value="todas">Todas as séries</option>
                  {series.map((nome) => (
                    <option key={nome} value={nome}>
                      {nome}
                    </option>
                  ))}
                </Select>
              )}

              <span className="lbb-section-count" style={{ marginLeft: "auto" }}>
                {visiveis.length} {visiveis.length === 1 ? "resultado" : "resultados"}
              </span>
            </div>

            {visiveis.length === 0 ? (
              <div style={{ marginTop: "var(--space-5)" }}>
                <EmptyState
                  icon="circle-help"
                  title="Nenhum livro com estes filtros"
                  description="O filtro olha o formato e a série do catálogo, sobre o resultado da busca."
                  action={
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setFormato("todos");
                        setSerie("todas");
                      }}
                    >
                      Limpar filtros
                    </Button>
                  }
                />
              </div>
            ) : (
            <div className="lbb-acervo-grid" style={{ marginTop: "var(--space-4)" }}>
              {visiveis.map((entry) => {
                const pdf = entry.files.find((file) => file.format === "PDF");
                const escolhido = selected?.externalId === entry.externalId;

                return (
                  <button
                    key={entry.externalId}
                    type="button"
                    className="lbb-card"
                    aria-pressed={escolhido}
                    style={{
                      textAlign: "left",
                      cursor: "pointer",
                      borderColor: escolhido ? "var(--accent)" : undefined,
                      background: escolhido ? "var(--accent-surface)" : undefined,
                    }}
                    onClick={() => {
                      setSelected(entry);
                      setDuplicate(null);
                    }}
                  >
                    <span className="lbb-card-title">{entry.title}</span>
                    <span className="lbb-card-meta">
                      {/*
                        A série entra aqui: vinha do Calibre desde sempre e não aparecia em lugar
                        nenhum. Numa coleção de dez volumes é ela que diz qual é qual.
                      */}
                      {[
                        entry.authors.join("; "),
                        entry.series
                          ? `${entry.series}${entry.seriesIndex ? ` ${entry.seriesIndex}` : ""}`
                          : null,
                        entry.publisher,
                        entry.year,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    <span style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                      {pdf ? (
                        <Badge tone="info" mono>
                          PDF · {mb(pdf.sizeBytes)}
                        </Badge>
                      ) : (
                        // Sem PDF a captura por recorte não funciona, e é melhor dizer isso na
                        // lista do que depois da importação.
                        <Badge tone="warn" mono>
                          sem PDF
                        </Badge>
                      )}
                      {entry.duplicate && (
                        <Badge tone="warn" mono>
                          {DUPLICATE_LABEL[entry.duplicate]}
                        </Badge>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
            )}

            {entries.length === 0 && (
              <p style={{ color: "var(--text-secondary)", marginTop: "var(--space-4)" }}>
                Nenhum livro casa com esta pesquisa.
              </p>
            )}
          </>
        )}

        {selected && (
          <div style={{ marginTop: "var(--space-6)" }}>
            <Callout tone="info" title={`Importar “${selected.title}”`}>
              Entram no acervo: título, autores, editora, ano, ISBN, coleção e volume — mais o PDF e
              a capa, <strong>copiados</strong> para o storage do LatexBookBank.
              {selected.isbn && <div className="lbb-card-meta">ISBN {selected.isbn}</div>}
              {selected.series && (
                <div className="lbb-card-meta">
                  {selected.series}
                  {selected.seriesIndex ? ` · volume ${selected.seriesIndex}` : ""}
                </div>
              )}
            </Callout>

            {duplicate && (
              <div style={{ marginTop: "var(--space-3)" }}>
                <Banner tone="warn" title="Este livro já está no acervo">
                  {duplicate.message}
                  <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-3)" }}>
                    <Button size="sm" variant="secondary" href={`/publications/${duplicate.publicationId}`}>
                      Abrir o que já existe
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void importar(true)}>
                      Importar assim mesmo
                    </Button>
                  </div>
                </Banner>
              </div>
            )}

            <div className="lbb-acervo-actions">
              <Button variant="primary" loading={busy} onClick={() => void importar()}>
                Importar livro
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => setSelected(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
