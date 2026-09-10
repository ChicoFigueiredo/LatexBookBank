import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";
import {
  type CapituloDoLivro,
  type NoDaEstrutura,
  type ProgressoDeCaptura,
  faixaRevisada,
  formatarTamanho,
  resumirCaptura,
  sumarizarCapitulos,
} from "@modules/publications/domain/book-overview";
import { formatarEdicao } from "@modules/publications/domain/shelf-labels";

/**
 * O overview de um livro — a parada entre escolher e editar (protótipo, 492–599).
 *
 * O rail do protótipo separa `Publicações` de `Editor do livro` **porque esta tela existe**: abrir
 * um livro de 148 questões direto no workbench é entregar uma árvore e nenhuma resposta para "o
 * que falta aqui". Read model e não repositório, pela mesma razão da estante: nada disto é o
 * resumo que os casos de uso de escrita precisam carregar.
 */

export interface PendenciaDoLivro {
  readonly kind: "invalidas" | "captura" | "sem-questoes" | "sem-fonte";
  readonly label: string;
  /** Onde está — o texto mono à direita, no protótipo. */
  readonly where: string;
  readonly cta: string;
  readonly href: string;
  readonly icon: "triangle-alert" | "scan-text" | "file-text" | "circle-help";
}

export interface FonteEditorial {
  readonly filename: string;
  readonly size: string;
  /** De onde veio e quando — a linha em cinza abaixo do arquivo. */
  readonly origin: string;
}

export interface BookOverview {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string | null;
  /** Como o usuário chama o livro — "FME 3". Fica ao lado do título, não na grade de metadados. */
  readonly nickname: string | null;
  readonly authors: string | null;
  readonly libraryName: string;
  readonly librarySlug: string;
  /** O carimbo da lombada, para a capa desenhada. */
  readonly mark: string;
  readonly meta: readonly { readonly k: string; readonly v: string }[];
  readonly chapters: readonly CapituloDoLivro[];
  readonly questionCount: number;
  readonly invalidCount: number;
  readonly issues: readonly PendenciaDoLivro[];
  readonly source: FonteEditorial | null;
  readonly capture: ProgressoDeCaptura | null;
  readonly reviewedRange: string | null;
  /**
   * Livro sem capítulo e sem questão — o estado `LIVRO · vazio` do protótipo (601–642).
   *
   * É uma tela diferente, e não a mesma com menos coisa: um livro cheio responde "o que falta
   * aqui?", e um livro vazio responde "por onde começo?". A grade de estrutura vazia ao lado da
   * caixa de fonte responde à primeira pergunta com silêncio.
   */
  readonly isEmpty: boolean;
  /**
   * `Livro criado agora` — o eyebrow em tom ok, e só enquanto for verdade.
   *
   * Decidido **aqui** e não na tela: ler o relógio durante o render é impuro, o lint recusa, e a
   * razão do lint é a mesma que derrubou a Home — servidor e cliente lendo horas diferentes na
   * virada do minuto. Aqui o relógio é lido uma vez e o que atravessa é um booleano.
   */
  readonly justCreated: boolean;
}

/** Dez minutos. Passado isso, "criado agora" vira ruído e o eyebrow volta a ser o endereço. */
const RECEM_CRIADO_MS = 10 * 60 * 1000;

export async function readBookOverview(publicationId: string): Promise<BookOverview | null> {
  const publication = await prisma.publication.findUnique({
    where: { id: publicationId },
    select: {
      id: true,
      title: true,
      subtitle: true,
      nickname: true,
      volume: true,
      edition: true,
      editionYear: true,
      publisher: true,
      isbn: true,
      language: true,
      series: true,
      importedAt: true,
      createdAt: true,
      sourcePdfAssetId: true,
      workspace: { select: { name: true, slug: true } },
      authors: {
        orderBy: { position: "asc" },
        select: { author: { select: { name: true } } },
      },
    },
  });

  if (!publication) return null;

  // Uma consulta pela árvore inteira e três agregações, não uma consulta por capítulo: a estrutura
  // de um livro cabe folgada na memória, e a alternativa é o mesmo N+1 que a estante já evitou.
  const [nos, primeiraInvalida, anchors, sourceAsset] = await Promise.all([
    prisma.documentNode.findMany({
      where: { publicationId, deletedAt: null },
      select: {
        id: true,
        parentId: true,
        kind: true,
        title: true,
        originalLabel: true,
        sortKey: true,
        questionId: true,
        question: { select: { validationStatus: true } },
      },
    }),
    prisma.documentNode.findFirst({
      where: { publicationId, deletedAt: null, question: { validationStatus: "INVALID" } },
      orderBy: { sortKey: "asc" },
      select: { id: true },
    }),
    prisma.sourceAnchor.findMany({
      where: { publicationId },
      select: { pageNumber: true, questions: { select: { id: true }, take: 1 } },
    }),
    publication.sourcePdfAssetId
      ? prisma.asset.findUnique({
          where: { id: publication.sourcePdfAssetId },
          select: { originalFilename: true, sizeBytes: true, createdAt: true },
        })
      : null,
  ]);

  const estrutura: NoDaEstrutura[] = nos.map((no) => ({
    id: no.id,
    parentId: no.parentId,
    kind: no.kind,
    title: no.title,
    originalLabel: no.originalLabel,
    sortKey: no.sortKey,
    isQuestion: no.questionId !== null,
    isInvalid: no.question?.validationStatus === "INVALID",
  }));

  const chapters = sumarizarCapitulos(estrutura);
  const questionCount = estrutura.filter((no) => no.isQuestion).length;
  const invalidCount = estrutura.filter((no) => no.isInvalid).length;

  const capturados = anchors.filter((anchor) => anchor.questions.length > 0).length;
  const naFila = anchors.length - capturados;
  const ultimaPagina = anchors.reduce<number | null>(
    (fundo, anchor) => (fundo === null || anchor.pageNumber > fundo ? anchor.pageNumber : fundo),
    null,
  );

  return {
    id: publication.id,
    title: publication.title,
    subtitle: publication.subtitle,
    nickname: publication.nickname,
    authors: nomesPorExtenso(publication.authors.map((entry) => entry.author.name)),
    libraryName: publication.workspace.name,
    librarySlug: publication.workspace.slug,
    mark: publication.volume?.trim() || publication.title.trim().charAt(0).toUpperCase() || "?",
    meta: metadados(publication),
    chapters,
    questionCount,
    invalidCount,
    issues: pendencias({
      publicationId,
      invalidCount,
      primeiraInvalidaId: primeiraInvalida?.id ?? null,
      naFila,
      questionCount,
      temFonte: sourceAsset !== null,
    }),
    source: sourceAsset
      ? {
          filename: sourceAsset.originalFilename ?? "fonte.pdf",
          size: formatarTamanho(sourceAsset.sizeBytes),
          origin: publication.importedAt
            ? `Importado em ${dataCurta(publication.importedAt)}, guardado no acervo.`
            : `Anexado em ${dataCurta(sourceAsset.createdAt)}, guardado no acervo.`,
        }
      : null,
    capture: resumirCaptura(capturados, naFila, ultimaPagina),
    reviewedRange: faixaRevisada(chapters),
    isEmpty: chapters.length === 0 && questionCount === 0,
    justCreated: Date.now() - publication.createdAt.getTime() < RECEM_CRIADO_MS,
  };
}

/**
 * A grade de metadados — só o que se sabe.
 *
 * Quatro colunas com "—" em seis delas é uma tela dizendo que não sabe nada sobre o livro. Campo
 * vazio some, e a grade encolhe: o protótipo tem oito chaves porque o livro dele está completo.
 */
function metadados(publication: {
  publisher: string | null;
  edition: string | null;
  editionYear: number | null;
  isbn: string | null;
  language: string | null;
  series: string | null;
  volume: string | null;
}): readonly { k: string; v: string }[] {
  const pares: readonly (readonly [string, string | null])[] = [
    ["Editora", publication.publisher],
    ["Edição", formatarEdicao(publication.edition, publication.editionYear)],
    ["ISBN", publication.isbn],
    ["Idioma", publication.language],
    ["Série", publication.series],
    ["Volume", publication.volume],
  ];

  return pares
    .filter((par): par is readonly [string, string] => (par[1]?.trim() ?? "") !== "")
    .map(([k, v]) => ({ k, v: v.trim() }));
}

/**
 * Autores por extenso — aqui, ao contrário da estante, cabe o nome inteiro.
 *
 * `formatarAutores` corta para sobrenome porque a coluna da tabela tem 8,5rem. Esta linha tem a
 * largura do título, e "Gelson Iezzi, Carlos Murakami" é quem escreveu o livro; "Iezzi e outros"
 * seria economia num lugar que não precisa economizar. O Calibre grava `"Iezzi, Gelson"`, e a
 * vírgula é desfeita para o nome sair na ordem em que se lê.
 */
function nomesPorExtenso(nomes: readonly string[]): string | null {
  const limpos = nomes
    .map((nome) => {
      const limpo = nome.trim();
      const virgula = limpo.indexOf(",");
      if (virgula <= 0) return limpo;

      return `${limpo.slice(virgula + 1).trim()} ${limpo.slice(0, virgula).trim()}`.trim();
    })
    .filter((nome) => nome !== "");

  return limpos.length > 0 ? limpos.join(", ") : null;
}

/**
 * "Precisa da sua atenção" — o que está errado neste livro, em ordem de urgência.
 *
 * A mesma regra da Home: nenhuma linha aparece com contagem zero, e cada uma leva direto ao lugar
 * onde se resolve. A ordem é a do custo de ignorar — questão reprovada bloqueia a prova sair;
 * recorte na fila é só trabalho pela frente.
 */
function pendencias(facts: {
  publicationId: string;
  invalidCount: number;
  primeiraInvalidaId: string | null;
  naFila: number;
  questionCount: number;
  temFonte: boolean;
}): readonly PendenciaDoLivro[] {
  const issues: PendenciaDoLivro[] = [];
  const editor = `/publications/${facts.publicationId}/editor`;

  if (facts.invalidCount > 0 && facts.primeiraInvalidaId) {
    issues.push({
      kind: "invalidas",
      label:
        facts.invalidCount === 1
          ? "1 questão reprovada na validação"
          : `${facts.invalidCount} questões reprovadas na validação`,
      where: "enunciado, alternativas ou gabarito",
      cta: "Revisar",
      href: `${editor}?node=${facts.primeiraInvalidaId}`,
      icon: "triangle-alert",
    });
  }

  if (facts.naFila > 0) {
    issues.push({
      kind: "captura",
      label:
        facts.naFila === 1
          ? "1 recorte ainda não virou questão"
          : `${facts.naFila} recortes ainda não viraram questão`,
      where: "fila de captura",
      cta: "Abrir a fila",
      href: `/publications/${facts.publicationId}/ingestao`,
      icon: "scan-text",
    });
  }

  if (facts.questionCount === 0) {
    issues.push({
      kind: "sem-questoes",
      label: "O livro ainda não tem questão nenhuma",
      where: facts.temFonte ? "há uma fonte para recortar" : "comece pela estrutura",
      cta: facts.temFonte ? "Capturar" : "Abrir no editor",
      href: facts.temFonte ? `/publications/${facts.publicationId}/ingestao` : editor,
      icon: "circle-help",
    });
  }

  if (!facts.temFonte) {
    issues.push({
      kind: "sem-fonte",
      label: "Sem PDF fonte anexado",
      where: "não dá para recortar sem PDF",
      cta: "Anexar",
      href: `/publications/${facts.publicationId}/ingestao`,
      icon: "file-text",
    });
  }

  return issues;
}

/** "11/08/2026" — data curta, fixada em pt-BR e em UTC para o servidor e o cliente concordarem. */
const dataCurta = (data: Date): string =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(data);
