"use client";

import { useEffect, useState } from "react";

import {
  camposAPreencher,
  type CampoDoCatalogo,
  type PublicationMetadata,
} from "@modules/publications/domain/catalog-attach";

import {
  Badge,
  Banner,
  Button,
  Callout,
  Checkbox,
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
 *
 * ## Modo "escolher para este livro" (D44.1)
 *
 * Com `?para=<id>` na URL, a **mesma** tela deixa de importar e passa a **anexar**: escolher um
 * livro do catálogo dá o PDF dele a um livro que já existe no acervo. Nada da listagem muda — a
 * busca, os filtros, os formatos e o aviso de duplicata são os mesmos —, e o que muda é o que o
 * botão promete e o que acontece depois. Um diálogo novo de busca teria que reaprender tudo isso.
 */

interface CatalogEntry {
  readonly externalId: string;
  readonly title: string;
  readonly authors: readonly string[];
  readonly publisher: string | null;
  readonly year: number | null;
  readonly isbn: string | null;
  /** Veio sempre na resposta da rota; passou a ser lido quando anexar precisou preencher idioma. */
  readonly language: string | null;
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

/** O livro que recebe o PDF, quando a tela abre em modo "escolher para este livro" (D44). */
export interface AttachTarget {
  readonly id: string;
  readonly title: string;
  /** Já tem PDF fonte? Trocar é possível, mas nunca em silêncio. */
  readonly hasSource: boolean;
  /** O que o livro tem hoje — é contra isto que se decide o que o catálogo preencheria. */
  readonly metadata: PublicationMetadata;
}

export function CalibreScreen({
  library,
  configuredRoot,
  target = null,
  initialQuery = "",
}: {
  readonly library: { readonly id: string; readonly name: string; readonly slug: string };
  /**
   * `CALIBRE_LIBRARY_ROOT` do ambiente, quando existe.
   *
   * O caminho continua sendo preferência de máquina guardada no navegador (§65) — isto é só o
   * ponto de partida, para que uma instalação nova não comece com o campo vazio e para que uma
   * biblioteca que mudou de lugar seja um clique, não uma digitação. O que a pessoa escolher
   * continua ganhando.
   */
  readonly configuredRoot: string | null;
  /** Presente = a tela anexa em vez de importar. Ausente = a tela de sempre. */
  readonly target?: AttachTarget | null;
  /** A busca já digitada de onde a pessoa veio — hoje, do aviso de duplicata. */
  readonly initialQuery?: string;
}) {
  useAcervoStyles();

  const anexando = target !== null;

  const [root, setRoot] = useStoredState("lbb:calibre:root", configuredRoot ?? "");
  const [query, setQuery] = useState(initialQuery);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [entries, setEntries] = useState<readonly CatalogEntry[] | null>(null);
  /**
   * Seleção múltipla, na ordem do clique (beta-editorial.md, "não há importação em lote" —
   * o backend fechou primeiro, em `importManyFromCatalog`; isto é a tela alcançando ele).
   *
   * Com **um** livro marcado o fluxo é o de sempre — inclusive a conversa de duplicata, que é uma
   * escolha ("abrir o que existe" × "importar assim mesmo") e só faz sentido de um em um. Com
   * vários, a duplicata bloqueante vira linha de relatório, e quem quiser forçá-la importa aquele
   * livro sozinho depois.
   */
  const [selecionados, setSelecionados] = useState<readonly CatalogEntry[]>([]);
  const selected = selecionados.length === 1 ? (selecionados[0] ?? null) : null;

  /**
   * Formatos a copiar (P1 do beta-editorial.md, "só o PDF é copiado como fonte").
   *
   * `null` é "ninguém tocou": a tela mostra o PDF pré-marcado (o único que serve à captura por
   * recorte — dali a mesma badge "sem PDF" da lista), mas o pedido **não leva `formats`**, e quem
   * decide o padrão continua sendo o backend. Só quando a pessoa marca ou desmarca algo é que a
   * escolha vira um `Set` concreto e passa a viajar no corpo do pedido — mexer e voltar ao mesmo
   * estado do padrão ainda conta como "mexeu": é a intenção que mudou, não o resultado.
   *
   * As opções são as que a **seleção** de fato tem — união de `entry.files[].format` dos livros
   * marcados, nunca lista fixa. Mesmo princípio do filtro de formato ali em cima: se a seleção só
   * tem PDF, o controle nem aparece — perguntar algo com uma resposta só ensina a ignorar o
   * controle.
   */
  const [formatosEscolhidos, setFormatosEscolhidos] = useState<ReadonlySet<string> | null>(null);

  useEffect(() => {
    // Seleção mudou (marcou mais um, limpou, trocou de filtro): os formatos disponíveis podem ter
    // mudado junto, então a escolha manual anterior perde o sentido e volta ao padrão.
    setFormatosEscolhidos(null);
  }, [selecionados]);

  const formatosNaSelecao = [
    ...new Set(selecionados.flatMap((entry) => entry.files.map((file) => file.format))),
  ];
  const pdfNaSelecao = formatosNaSelecao.includes("PDF");
  const outrosFormatosNaSelecao = formatosNaSelecao
    .filter((format) => format !== "PDF")
    .sort();
  // PDF sempre primeiro quando existe — é o padrão, e a lista lida com ele por último faria
  // parecer um formato igual aos outros, quando não é.
  const ordemFormatos = pdfNaSelecao
    ? ["PDF", ...outrosFormatosNaSelecao]
    : outrosFormatosNaSelecao;
  const mostrarEscolhaDeFormatos = outrosFormatosNaSelecao.length > 0;

  const formatoMarcado = (format: string) =>
    formatosEscolhidos ? formatosEscolhidos.has(format) : format === "PDF";

  const alternarFormato = (format: string) => {
    setFormatosEscolhidos((atual) => {
      const base = new Set(atual ?? ordemFormatos.filter((f) => f === "PDF"));
      if (base.has(format)) base.delete(format);
      else base.add(format);
      return base;
    });
  };

  // `undefined` mantém o corpo do pedido igual ao de antes desta tela existir, para quem não
  // pediu nada — o padrão do backend (só o PDF) é dele, não da tela repeti-lo aqui.
  const formatsParaEnviar = formatosEscolhidos
    ? ordemFormatos.filter((format) => formatosEscolhidos.has(format))
    : undefined;

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
  /** Relatório do lote: um resultado por livro, na ordem pedida — sucesso com link, falha com razão. */
  const [batchDone, setBatchDone] = useState<
    readonly {
      readonly externalId: string;
      readonly title: string;
      readonly outcome:
        | { readonly kind: "imported"; readonly href: string; readonly warnings: readonly string[] }
        | { readonly kind: "failed"; readonly message: string };
    }[]
    | null
  >(null);

  /**
   * O que o catálogo preencheria no livro de destino — calculado **na tela**, com o que ela tem.
   *
   * A entrada do catálogo já está aqui (editora, ano, ISBN, autores, coleção) e o que o livro tem
   * chegou do servidor com a rota. Faltava só a regra, e ela é a mesma função pura que o servidor
   * chama antes de gravar: a tela mostra a promessa, o servidor a cumpre contra o livro recém-lido
   * do banco. Um endpoint de simulação diria a mesma coisa uma viagem depois.
   */
  const [preencherCampos, setPreencherCampos] = useState(true);
  const camposOferecidos: readonly CampoDoCatalogo[] =
    target && selected ? camposAPreencher(target.metadata, selected) : [];

  /** A troca de fonte, quando o livro já tem uma — só depois de dita (D44.5). */
  const [trocar, setTrocar] = useState<string | null>(null);
  const [anexado, setAnexado] = useState<{
    readonly href: string;
    readonly filename: string;
    readonly replaced: boolean;
    readonly filled: readonly CampoDoCatalogo[];
    readonly warnings: readonly string[];
  } | null>(null);

  const alternar = (entry: CatalogEntry) => {
    setDuplicate(null);
    setTrocar(null);
    // Anexar é de um livro para um livro: marcar dois não quer dizer nada, e a segunda marcação
    // troca a escolha em vez de somar a ela.
    if (anexando) {
      setSelecionados((atual) =>
        atual.some((e) => e.externalId === entry.externalId) ? [] : [entry],
      );
      return;
    }

    setSelecionados((atual) =>
      atual.some((e) => e.externalId === entry.externalId)
        ? atual.filter((e) => e.externalId !== entry.externalId)
        : [...atual, entry],
    );
  };

  /**
   * Anexar o PDF do livro escolhido ao livro de destino.
   *
   * `replace` é a segunda ida ao servidor, depois de a pessoa ver que o livro já tem fonte e
   * confirmar. A primeira volta com 409 — e é assim de propósito: quem decide a troca é quem está
   * olhando a tela, não o cliente adivinhando pelo `hasSource` que leu ao abrir a página.
   */
  const anexar = async (publicationId: string, replace = false) => {
    if (selected === null) return;

    setBusy(true);
    setError(null);
    setTrocar(null);

    try {
      const response = await fetch("/api/catalog/attach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          path: root,
          publicationId,
          externalId: selected.externalId,
          replace,
          fillMetadata: preencherCampos,
          ...(formatsParaEnviar ? { formats: formatsParaEnviar } : {}),
        }),
      });
      const payload = (await response.json()) as {
        href?: string;
        filename?: string;
        replaced?: string | null;
        filled?: CampoDoCatalogo[];
        warnings?: string[];
        message?: string;
        error?: string;
      };

      if (response.status === 409 && payload.error === "publication_has_source") {
        setTrocar(payload.message ?? "Este livro já tem um PDF fonte.");
        return;
      }

      if (!response.ok || !payload.href) {
        setError(payload.message ?? "Não deu para anexar.");
        return;
      }

      setAnexado({
        href: payload.href,
        filename: payload.filename ?? "o PDF",
        replaced: typeof payload.replaced === "string",
        filled: payload.filled ?? [],
        warnings: payload.warnings ?? [],
      });
    } catch {
      setError("Não deu para falar com o servidor.");
    } finally {
      setBusy(false);
    }
  };

  const abrir = async (texto = query) => {
    setBusy(true);
    setError(null);
    setDone(null);
    setBatchDone(null);

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

  const importarLote = async () => {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/catalog/import-batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          path: root,
          libraryId: library.id,
          externalIds: selecionados.map((entry) => entry.externalId),
          // Ausente quando ninguém tocou no controle — o padrão (só PDF) é do backend.
          ...(formatsParaEnviar ? { formats: formatsParaEnviar } : {}),
        }),
      });
      const payload = (await response.json()) as {
        results?: {
          externalId: string;
          outcome:
            | { kind: "imported"; result: { href: string; warnings: string[] } }
            | { kind: "failed"; message: string };
        }[];
        message?: string;
      };

      if (!response.ok || !payload.results) {
        setError(payload.message ?? "Não deu para importar o lote.");
        return;
      }

      const porId = new Map(selecionados.map((entry) => [entry.externalId, entry]));
      setBatchDone(
        payload.results.map((linha) => ({
          externalId: linha.externalId,
          title: porId.get(linha.externalId)?.title ?? linha.externalId,
          outcome:
            linha.outcome.kind === "imported"
              ? {
                  kind: "imported",
                  href: linha.outcome.result.href,
                  warnings: linha.outcome.result.warnings,
                }
              : { kind: "failed", message: linha.outcome.message },
        })),
      );
    } catch {
      setError("Não deu para falar com o servidor.");
    } finally {
      setBusy(false);
    }
  };

  const importar = async (force = false) => {
    if (selecionados.length > 1) {
      await importarLote();
      return;
    }
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
          // Ausente quando ninguém tocou no controle — o padrão (só PDF) é do backend.
          ...(formatsParaEnviar ? { formats: formatsParaEnviar } : {}),
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
    ...(target
      ? [{ label: target.title, href: `/publications/${target.id}` }, { label: "Anexar do Calibre" }]
      : [{ label: "Calibre" }]),
  ];

  if (anexado) {
    return (
      <AppShell activeModule="bibliotecas" breadcrumb={breadcrumb}>
        <div className="lbb-acervo">
          <PageHeader eyebrow="PDF FONTE ANEXADO" title={target?.title ?? "Livro"} />
          <Callout tone="ok" title={anexado.filename}>
            O arquivo foi <strong>copiado</strong> para o storage do LatexBookBank — o livro
            continua inteiro aqui mesmo que a pasta do Calibre mude de lugar.
            {anexado.replaced && (
              <div className="lbb-card-meta">
                O PDF anterior continua no acervo: os recortes já feitos apontam para ele.
              </div>
            )}
            {anexado.filled.length > 0 && (
              <ul style={{ margin: "8px 0 0", paddingLeft: "1.2rem" }}>
                {anexado.filled.map((campo) => (
                  <li key={campo.field}>
                    {campo.label}: {campo.value}
                  </li>
                ))}
              </ul>
            )}
            {anexado.warnings.map((warning) => (
              <div key={warning} className="lbb-card-meta">
                {warning}
              </div>
            ))}
          </Callout>

          <div className="lbb-acervo-actions">
            <Button variant="primary" icon="book-open" href={anexado.href}>
              Abrir o livro
            </Button>
            <Button variant="secondary" icon="scan-text" href={`${anexado.href}/ingestao`}>
              Capturar questões
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  if (batchDone) {
    const importados = batchDone.filter((linha) => linha.outcome.kind === "imported");
    const falhas = batchDone.filter((linha) => linha.outcome.kind === "failed");

    return (
      <AppShell activeModule="bibliotecas" breadcrumb={breadcrumb}>
        <div className="lbb-acervo">
          <PageHeader
            eyebrow="IMPORTADO DO CALIBRE"
            title={`${importados.length} de ${batchDone.length} livros no acervo`}
          />
          {falhas.length > 0 && (
            <Callout tone="warn" title={`${falhas.length} não entraram`}>
              Cada um tem a razão ao lado. Duplicata bloqueante se resolve importando o livro
              sozinho — é lá que mora a escolha entre abrir o que existe e importar assim mesmo.
            </Callout>
          )}
          <ul style={{ margin: "var(--space-4) 0 0", padding: 0, listStyle: "none" }}>
            {batchDone.map((linha) => (
              <li
                key={linha.externalId}
                className="lbb-card"
                style={{ marginBottom: "var(--space-2)" }}
              >
                <span className="lbb-card-title">{linha.title}</span>
                {linha.outcome.kind === "imported" ? (
                  <span style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                    <Badge tone="ok" mono>
                      importado
                    </Badge>
                    <Button size="sm" variant="secondary" href={linha.outcome.href}>
                      Abrir
                    </Button>
                    {linha.outcome.warnings.map((warning) => (
                      <span key={warning} className="lbb-card-meta">
                        {warning}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                    <Badge tone="warn" mono>
                      não entrou
                    </Badge>
                    <span className="lbb-card-meta">{linha.outcome.message}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>

          <div className="lbb-acervo-actions">
            <Button
              variant="secondary"
              icon="library"
              onClick={() => {
                setBatchDone(null);
                setSelecionados([]);
                void abrir();
              }}
            >
              Voltar ao catálogo
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

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
                setSelecionados([]);
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
          eyebrow={target ? "ANEXAR PDF FONTE" : "IMPORTAR DO CALIBRE"}
          title={target ? target.title : library.name}
          meta={
            target
              ? "Escolha no catálogo o livro cujo PDF vira a fonte deste. Nenhum livro novo é criado."
              : "Aponte a pasta da biblioteca — a que tem o arquivo metadata.db dentro."
          }
        />

        {error && (
          <Banner tone="danger" title="Não deu certo" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        )}

        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-end" }}>
          <div style={{ flex: 1, maxWidth: "34rem" }}>
            <Field
              label="Pasta da biblioteca"
              hint={
                configuredRoot
                  ? `Caminho completo. A configurada nesta máquina é ${configuredRoot}.`
                  : "Caminho completo da pasta que contém o metadata.db."
              }
            >
              <Input
                value={root}
                placeholder={configuredRoot ?? "/caminho/para/Calibre"}
                onChange={(event) => setRoot(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && root.trim() !== "") void abrir();
                }}
              />
            </Field>
            {/*
              O caminho vive no navegador, então uma biblioteca que muda de lugar deixa para trás
              um valor que não abre mais — foi o que aconteceu com o acervo na reinstalação. Sem
              isto, o conserto é lembrar o caminho novo e digitá-lo; com isto, é um clique.
            */}
            {configuredRoot && root.trim() !== configuredRoot && (
              <div style={{ marginTop: "var(--space-1)" }}>
                <Button variant="ghost" size="sm" onClick={() => setRoot(configuredRoot)}>
                  Usar a biblioteca configurada
                </Button>
              </div>
            )}
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

              {/*
                O gesto que faz o lote valer: filtrar (só PDF, só uma coleção) e marcar tudo de
                uma vez. Sem ele, importar uma série de dez volumes são dez cliques mirados — com
                ele, são dois. Só some quando não há o que marcar.
              */}
              {visiveis.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setDuplicate(null);
                    setSelecionados((atual) => {
                      const ids = new Set(atual.map((e) => e.externalId));
                      return [...atual, ...visiveis.filter((e) => !ids.has(e.externalId))];
                    });
                  }}
                >
                  Selecionar visíveis
                </Button>
              )}
              {selecionados.length > 0 && (
                <Button size="sm" variant="ghost" onClick={() => setSelecionados([])}>
                  Limpar seleção
                </Button>
              )}

              <span className="lbb-section-count" style={{ marginLeft: "auto" }}>
                {visiveis.length} {visiveis.length === 1 ? "resultado" : "resultados"}
                {selecionados.length > 0 ? ` · ${selecionados.length} na seleção` : ""}
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
                const escolhido = selecionados.some((e) => e.externalId === entry.externalId);

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
                    onClick={() => alternar(entry)}
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

        {anexando && selected && target && (
          <div style={{ marginTop: "var(--space-6)" }}>
            <Callout
              tone="info"
              title={`Anexar “${selected.title}” a “${target.title}”`}
            >
              O PDF é <strong>copiado</strong> para o storage do LatexBookBank
              {selected.hasCover ? ", com a capa," : ""} e vira a fonte de recorte deste livro. O
              livro do Calibre não fica ligado a ele — o catálogo é a origem do arquivo, não o dono
              do livro.
              {!selected.files.some((file) => file.format === "PDF") && (
                <div className="lbb-card-meta">
                  Este livro do Calibre não tem PDF — só{" "}
                  {selected.files.map((file) => file.format).join(", ") || "nada"}. Só o PDF serve
                  de fonte para recortar.
                </div>
              )}
            </Callout>

            {/*
              A lista à vista **antes** de confirmar (D44.2): o que o catálogo preencheria, campo a
              campo, e só onde o livro está vazio. Sem a lista, "trazer os metadados" é um cheque em
              branco sobre a ficha de um livro que alguém já preencheu à mão.
            */}
            {camposOferecidos.length > 0 ? (
              <div style={{ marginTop: "var(--space-3)" }}>
                <Checkbox
                  label={`Preencher ${camposOferecidos.length === 1 ? "o campo vazio" : "os campos vazios"} com o que o catálogo tem`}
                  checked={preencherCampos}
                  onChange={() => setPreencherCampos((atual) => !atual)}
                />
                <ul
                  style={{
                    margin: "6px 0 0",
                    paddingLeft: "1.6rem",
                    color: "var(--text-secondary)",
                    fontSize: "var(--text-body-sm)",
                    opacity: preencherCampos ? 1 : 0.5,
                  }}
                >
                  {camposOferecidos.map((campo) => (
                    <li key={campo.field}>
                      {campo.label}: {campo.value}
                    </li>
                  ))}
                </ul>
                <div className="lbb-card-meta">
                  O que já está preenchido não é tocado — nem aqui, nem depois.
                </div>
              </div>
            ) : (
              <div className="lbb-card-meta" style={{ marginTop: "var(--space-3)" }}>
                Nada a preencher: este livro já tem os metadados que o catálogo conhece.
              </div>
            )}

            {trocar && (
              <div style={{ marginTop: "var(--space-3)" }}>
                <Banner tone="warn" title="Este livro já tem um PDF fonte">
                  {trocar} O arquivo de agora continua no acervo e continua listado no resumo do
                  livro, porque os recortes já feitos apontam para ele.
                  <div
                    style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-3)" }}
                  >
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busy}
                      onClick={() => void anexar(target.id, true)}
                    >
                      Trocar a fonte
                    </Button>
                    <Button size="sm" variant="ghost" href={`/publications/${target.id}`}>
                      Ver o livro antes
                    </Button>
                  </div>
                </Banner>
              </div>
            )}

            <div className="lbb-acervo-actions">
              <Button
                variant="primary"
                loading={busy}
                disabled={!selected.files.some((file) => file.format === "PDF")}
                onClick={() => void anexar(target.id)}
              >
                {target.hasSource ? "Trocar o PDF fonte deste livro" : "Anexar ao livro"}
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => setSelecionados([])}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {!anexando && selecionados.length > 0 && (
          <div style={{ marginTop: "var(--space-6)" }}>
            {selected ? (
              <Callout tone="info" title={`Importar “${selected.title}”`}>
                Entram no acervo: título, autores, editora, ano, ISBN, coleção e volume — mais o
                PDF e a capa, <strong>copiados</strong> para o storage do LatexBookBank.
                {selected.isbn && <div className="lbb-card-meta">ISBN {selected.isbn}</div>}
                {selected.series && (
                  <div className="lbb-card-meta">
                    {selected.series}
                    {selected.seriesIndex ? ` · volume ${selected.seriesIndex}` : ""}
                  </div>
                )}
              </Callout>
            ) : (
              <Callout tone="info" title={`Importar ${selecionados.length} livros`}>
                Um por um, na ordem marcada — o que falhar não derruba os outros, e o relatório
                diz o que entrou e o que não entrou, com a razão.
                <div className="lbb-card-meta">
                  {selecionados.map((entry) => entry.title).join(" · ")}
                </div>
              </Callout>
            )}

            {mostrarEscolhaDeFormatos && (
              <div style={{ marginTop: "var(--space-3)" }}>
                <div className="lbb-card-meta" style={{ marginBottom: 6 }}>
                  Formatos a copiar — PDF vem sempre marcado, é o único que serve à captura por
                  recorte.
                </div>
                <div
                  role="group"
                  aria-label="Formatos a copiar"
                  style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}
                >
                  {ordemFormatos.map((format) => (
                    <Checkbox
                      key={format}
                      label={format}
                      checked={formatoMarcado(format)}
                      onChange={() => alternarFormato(format)}
                    />
                  ))}
                </div>
              </div>
            )}

            {duplicate && (
              <div style={{ marginTop: "var(--space-3)" }}>
                <Banner tone="warn" title="Este livro já está no acervo">
                  {duplicate.message}
                  <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-3)" }}>
                    <Button size="sm" variant="secondary" href={`/publications/${duplicate.publicationId}`}>
                      Abrir o que já existe
                    </Button>
                    {/*
                      A terceira saída (D44.7): o livro já está no acervo, e o que falta nele é
                      justamente o arquivo. Antes daqui só havia "abrir o que existe" — que leva a
                      um livro sem fonte — e "importar assim mesmo", que cria o segundo livro igual.
                    */}
                    <Button
                      size="sm"
                      variant="secondary"
                      href={`/bibliotecas/${library.slug}/livros/calibre?para=${duplicate.publicationId}&q=${encodeURIComponent(selected?.title ?? query)}`}
                    >
                      Anexar ao livro que já existe
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
                {selecionados.length > 1
                  ? `Importar ${selecionados.length} livros`
                  : "Importar livro"}
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => setSelecionados([])}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
