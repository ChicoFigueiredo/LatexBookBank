"use client";

import { useState } from "react";

import {
  Badge,
  Banner,
  Button,
  Callout,
  Field,
  Input,
  PageHeader,
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
            <div style={{ maxWidth: "26rem", marginTop: "var(--space-5)" }}>
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

            <div className="lbb-acervo-grid" style={{ marginTop: "var(--space-4)" }}>
              {entries.map((entry) => {
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
                      {[entry.authors.join("; "), entry.publisher, entry.year]
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
