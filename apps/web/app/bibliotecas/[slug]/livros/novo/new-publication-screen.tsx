"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Banner, Button, Callout, Field, Input, PageHeader } from "@/design-system";

import { useAcervoStyles } from "../../../../acervo-styles";
import { AppShell } from "../../../../app-shell";

/**
 * Cadastro manual de livro.
 *
 * **Só o título é obrigatório** (design §5). Os campos avançados ficam atrás de "Mais detalhes":
 * progressive disclosure, §66 do prompt do time — mostrar onze campos de uma vez faz o formulário
 * parecer uma exigência quando ele é uma oportunidade.
 *
 * Depois de salvar, a tela não volta para a lista: oferece as próximas ações concretas, que é o
 * que o design pede e o que impede o "e agora?".
 */

interface Saved {
  readonly id: string;
  readonly title: string;
}

export function NewPublicationScreen({
  library,
}: {
  readonly library: { readonly id: string; readonly name: string; readonly slug: string };
}) {
  useAcervoStyles();
  const router = useRouter();

  const [form, setForm] = useState({
    title: "",
    subtitle: "",
    authors: "",
    publisher: "",
    edition: "",
    editionYear: "",
    isbn: "",
    language: "pt-BR",
    series: "",
    volume: "",
    notes: "",
  });
  const [more, setMore] = useState(false);
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<Saved | null>(null);

  const set = (key: keyof typeof form) => (value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    // O erro é sobre o valor anterior daquele campo. Mantê-lo enquanto se corrige faria a tela
    // contradizer o que está escrito nela.
    if (fieldError?.field === key) setFieldError(null);
  };

  const errorFor = (field: string) => (fieldError?.field === field ? fieldError.message : undefined);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setFieldError(null);

    try {
      const response = await fetch(`/api/libraries/${library.id}/publications`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          // Ponto e vírgula separa autores porque vírgula já separa sobrenome de nome —
          // "Iezzi, Gelson; Murakami, Carlos" é como a ficha catalográfica escreve.
          authors: form.authors,
          editionYear: form.editionYear === "" ? null : form.editionYear,
        }),
      });
      const payload = (await response.json()) as {
        publication?: { id: string; title: string };
        message?: string;
        field?: string;
      };

      if (!response.ok || !payload.publication) {
        if (payload.field) setFieldError({ field: payload.field, message: payload.message ?? "" });
        else setError(payload.message ?? "Não deu para cadastrar o livro.");
        return;
      }

      setSaved(payload.publication);
      router.refresh();
    } catch {
      setError("Não deu para falar com o servidor.");
    } finally {
      setBusy(false);
    }
  };

  if (saved) {
    return (
      <AppShell
        activeModule="bibliotecas"
        breadcrumb={[
          { label: "Bibliotecas", href: "/bibliotecas" },
          { label: library.name, href: `/bibliotecas/${library.slug}` },
          { label: saved.title },
        ]}
      >
        <div className="lbb-acervo">
          <PageHeader eyebrow="LIVRO CADASTRADO" title={saved.title} />
          <Callout tone="ok" title="Livro criado">
            Ele já está na biblioteca {library.name}. O próximo passo é dar estrutura ou capturar a
            primeira questão.
          </Callout>
          <div className="lbb-acervo-actions">
            <Button variant="primary" icon="list-tree" href={`/publications/${saved.id}`}>
              Abrir no editor
            </Button>
            <Button
              variant="secondary"
              icon="scan-text"
              href={`/publications/${saved.id}/ingestao`}
            >
              Capturar primeira questão
            </Button>
            <Button variant="ghost" href={`/bibliotecas/${library.slug}`}>
              Voltar à biblioteca
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      activeModule="bibliotecas"
      breadcrumb={[
        { label: "Bibliotecas", href: "/bibliotecas" },
        { label: library.name, href: `/bibliotecas/${library.slug}` },
        { label: "Novo livro" },
      ]}
    >
      <div className="lbb-acervo" style={{ maxWidth: "52rem" }}>
        <PageHeader
          eyebrow="CADASTRO MANUAL"
          title="Adicionar livro"
          meta="Dá para começar só com o título e completar o resto depois."
        />

        {error && (
          <Banner tone="danger" title="Não deu para cadastrar" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        )}

        <div className="lbb-form-grid">
          <div className="lbb-form-wide">
            <Field label="Título" required {...(errorFor("title") ? { error: errorFor("title") } : {})}>
              <Input
                autoFocus
                value={form.title}
                placeholder="Fundamentos de Matemática Elementar"
                onChange={(event) => set("title")(event.target.value)}
              />
            </Field>
          </div>

          <div className="lbb-form-wide">
            <Field
              label="Autores"
              optional
              hint="Separe por ponto e vírgula: Iezzi, Gelson; Murakami, Carlos"
              {...(errorFor("authors") ? { error: errorFor("authors") } : {})}
            >
              <Input
                value={form.authors}
                onChange={(event) => set("authors")(event.target.value)}
              />
            </Field>
          </div>

          <Field label="Editora" optional>
            <Input
              value={form.publisher}
              onChange={(event) => set("publisher")(event.target.value)}
            />
          </Field>

          <Field
            label="Ano"
            optional
            {...(errorFor("editionYear") ? { error: errorFor("editionYear") } : {})}
          >
            <Input
              inputMode="numeric"
              value={form.editionYear}
              placeholder="2013"
              onChange={(event) => set("editionYear")(event.target.value)}
            />
          </Field>
        </div>

        <div style={{ marginTop: "var(--space-4)" }}>
          <Button
            variant="ghost"
            size="sm"
            icon={more ? "chevron-down" : "chevron-right"}
            aria-expanded={more}
            onClick={() => setMore((current) => !current)}
          >
            Mais detalhes
          </Button>
        </div>

        {more && (
          <div className="lbb-form-grid">
            <div className="lbb-form-wide">
              <Field label="Subtítulo" optional>
                <Input
                  value={form.subtitle}
                  onChange={(event) => set("subtitle")(event.target.value)}
                />
              </Field>
            </div>

            <Field label="Edição" optional>
              <Input
                value={form.edition}
                placeholder="8ª"
                onChange={(event) => set("edition")(event.target.value)}
              />
            </Field>

            <Field label="ISBN" optional {...(errorFor("isbn") ? { error: errorFor("isbn") } : {})}>
              <Input value={form.isbn} onChange={(event) => set("isbn")(event.target.value)} />
            </Field>

            <Field label="Idioma" optional hint="Código curto: pt-BR, en, es.">
              <Input
                value={form.language}
                onChange={(event) => set("language")(event.target.value)}
              />
            </Field>

            <Field label="Série ou coleção" optional>
              <Input value={form.series} onChange={(event) => set("series")(event.target.value)} />
            </Field>

            <Field label="Volume" optional>
              <Input
                value={form.volume}
                placeholder="4"
                onChange={(event) => set("volume")(event.target.value)}
              />
            </Field>

            <div className="lbb-form-wide">
              <Field label="Notas" optional>
                <Input value={form.notes} onChange={(event) => set("notes")(event.target.value)} />
              </Field>
            </div>
          </div>
        )}

        <div className="lbb-acervo-actions">
          <Button
            variant="primary"
            loading={busy}
            disabled={form.title.trim() === ""}
            onClick={() => void submit()}
          >
            Cadastrar livro
          </Button>
          <Button variant="ghost" href={`/bibliotecas/${library.slug}`}>
            Cancelar
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
