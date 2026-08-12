import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";

/**
 * O que a Home mostra para quem já tem acervo.
 *
 * A prioridade é a do design (ajustes finais §19): **continuar trabalhando** vem antes de tudo.
 * Uma Home que abre com um dashboard obriga a lembrar onde se parou; esta responde antes de ser
 * perguntada.
 *
 * Uma leitura só, aqui na infraestrutura, porque é um **read model**: nenhuma regra de negócio
 * decide o que entra: é projeção para uma tela. Espalhar isso por três repositórios daria três
 * consultas e a mesma resposta.
 */

export interface ContinueWhere {
  readonly questionId: string;
  readonly nodeId: string;
  readonly publicationId: string;
  readonly publicationTitle: string;
  readonly libraryName: string;
  /** "Capítulo 1 › Exercícios › Questão 27" — o caminho, não só o nó. */
  readonly path: string;
  readonly updatedAt: Date;
  /** O número grande na lombada da miniatura. */
  readonly volume: string | null;
  /** A faixa de rodapé do cartão: o tamanho do livro, não o da sessão. */
  readonly chapterCount: number;
  readonly questionCount: number;
  readonly invalidCount: number;
  /**
   * A fonte editorial, quando existe.
   *
   * O protótipo mostra “412 pág.” — número que este banco não tem: nada guarda a contagem de
   * páginas do PDF. O tamanho está guardado e é verdadeiro, então ocupa o mesmo lugar. Inventar a
   * página seria a única forma de o cartão bater com o desenho, e o desenho não vale isso.
   */
  readonly source: { readonly filename: string; readonly sizeBytes: number } | null;
}

/**
 * Um grupo de pendências da Home.
 *
 * `kind` é semântico de propósito: ícone e cor são decisão da tela, e infraestrutura que devolve
 * `lucide:triangle-alert` é infraestrutura decidindo layout.
 *
 * Todo grupo carrega um `href` que **leva a algum lugar de verdade** (§81). Um contador que não
 * abre nada é pior do que não mostrar o contador: ele informa um problema e esconde o caminho.
 */
export type PendingKind = "invalidas" | "captura" | "sem-questoes";

export interface PendingGroup {
  readonly kind: PendingKind;
  readonly count: number;
  readonly title: string;
  readonly meta: string;
  readonly cta: string;
  readonly href: string;
}

/** Uma biblioteca na Home, com o suficiente para decidir se vale entrar. */
export interface HomeLibraryRow {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly publicationCount: number;
  readonly questionCount: number;
  readonly invalidCount: number;
  readonly updatedAt: Date;
}

export interface RecentPublication {
  readonly id: string;
  readonly title: string;
  readonly libraryName: string;
  readonly librarySlug: string;
  readonly questionCount: number;
  readonly updatedAt: Date;
}

export interface HomeOverview {
  readonly continueWhere: ContinueWhere | null;
  readonly recent: readonly RecentPublication[];
  /** Questões que a validação reprovou — o que impede a prova de sair. */
  readonly invalidCount: number;
  /** Já ordenado do mais urgente ao menos; vazio quando não há nada a fazer. */
  readonly pending: readonly PendingGroup[];
  readonly libraries: readonly HomeLibraryRow[];
}

export async function readHomeOverview(): Promise<HomeOverview> {
  const [lastNode, recentRows, invalidCount] = await Promise.all([
    prisma.documentNode.findFirst({
      where: { deletedAt: null, questionId: { not: null } },
      orderBy: { question: { updatedAt: "desc" } },
      select: {
        id: true,
        title: true,
        parentId: true,
        publicationId: true,
        publication: {
          select: {
            title: true,
            volume: true,
            sourcePdfAssetId: true,
            workspace: { select: { name: true } },
          },
        },
        question: { select: { id: true, updatedAt: true, nickname: true } },
      },
    }),
    prisma.publication.findMany({
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: {
        id: true,
        title: true,
        updatedAt: true,
        workspace: { select: { name: true, slug: true } },
      },
    }),
    prisma.question.count({ where: { validationStatus: "INVALID" } }),
  ]);

  const [questionCounts, pending, libraries] = await Promise.all([
    countQuestionsByPublication(recentRows.map((row) => row.id)),
    readPending(invalidCount),
    readLibraryRows(),
  ]);

  return {
    continueWhere: lastNode?.question
      ? {
          questionId: lastNode.question.id,
          nodeId: lastNode.id,
          publicationId: lastNode.publicationId,
          publicationTitle: lastNode.publication.title,
          libraryName: lastNode.publication.workspace.name,
          path: await pathOf(lastNode.parentId, lastNode.title ?? lastNode.question.nickname ?? "Questão"),
          updatedAt: lastNode.question.updatedAt,
          volume: lastNode.publication.volume,
          ...(await readBookFacts(lastNode.publicationId, lastNode.publication.sourcePdfAssetId)),
        }
      : null,
    recent: recentRows.map((row) => ({
      id: row.id,
      title: row.title,
      libraryName: row.workspace.name,
      librarySlug: row.workspace.slug,
      questionCount: questionCounts.get(row.id) ?? 0,
      updatedAt: row.updatedAt,
    })),
    invalidCount,
    pending,
    libraries,
  };
}

/** O tamanho do livro corrente — a faixa de rodapé do cartão de retomada. */
async function readBookFacts(
  publicationId: string,
  sourcePdfAssetId: string | null,
): Promise<{
  chapterCount: number;
  questionCount: number;
  invalidCount: number;
  source: { filename: string; sizeBytes: number } | null;
}> {
  const [chapterCount, questionCount, invalidCount, sourceAsset] = await Promise.all([
    prisma.documentNode.count({ where: { publicationId, deletedAt: null, kind: "CHAPTER" } }),
    prisma.documentNode.count({
      where: { publicationId, deletedAt: null, questionId: { not: null } },
    }),
    prisma.question.count({
      where: { validationStatus: "INVALID", node: { publicationId, deletedAt: null } },
    }),
    sourcePdfAssetId
      ? prisma.asset.findUnique({
          where: { id: sourcePdfAssetId },
          select: { originalFilename: true, sizeBytes: true },
        })
      : null,
  ]);

  return {
    chapterCount,
    questionCount,
    invalidCount,
    source: sourceAsset
      ? {
          filename: sourceAsset.originalFilename ?? "fonte.pdf",
          sizeBytes: sourceAsset.sizeBytes,
        }
      : null,
  };
}

/**
 * As pendências que valem a Home.
 *
 * Três, e cada uma responde a uma pergunta diferente: o que está **errado** (inválidas), o que
 * está **parado no meio** (capturas sem questão) e o que está **vazio** (livro sem questão
 * nenhuma). Um quarto contador que não muda o que fazer a seguir seria ruído.
 *
 * Nenhuma entra na lista quando é zero: “0 pendências” é uma linha que ocupa espaço para dizer que
 * não havia nada a dizer.
 */
async function readPending(invalidCount: number): Promise<readonly PendingGroup[]> {
  const [invalidTarget, capturas, semQuestoes] = await Promise.all([
    invalidCount > 0
      ? prisma.documentNode.findFirst({
          where: { deletedAt: null, question: { validationStatus: "INVALID" } },
          orderBy: { updatedAt: "desc" },
          select: { id: true, publicationId: true },
        })
      : null,
    // A fila de captura é derivada: recorte que ainda não virou questão (ver `capture-queue.ts`).
    prisma.sourceAnchor.groupBy({
      by: ["publicationId"],
      where: { questions: { none: {} } },
      _count: { _all: true },
    }),
    prisma.publication.findMany({
      where: { nodes: { none: { deletedAt: null, questionId: { not: null } } } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true },
    }),
  ]);

  const groups: PendingGroup[] = [];

  if (invalidCount > 0 && invalidTarget) {
    const livros = await prisma.documentNode.groupBy({
      by: ["publicationId"],
      where: { deletedAt: null, question: { validationStatus: "INVALID" } },
      _count: { _all: true },
    });

    groups.push({
      kind: "invalidas",
      count: invalidCount,
      title: invalidCount === 1 ? "Questão inválida" : "Questões inválidas",
      meta: `A validação reprovou — enunciado, alternativas ou gabarito · ${plural(livros.length, "livro", "livros")}`,
      cta: "Revisar",
      href: `/publications/${invalidTarget.publicationId}/editor?node=${invalidTarget.id}`,
    });
  }

  const totalCapturas = capturas.reduce((sum, row) => sum + row._count._all, 0);
  const maiorFila = [...capturas].sort((a, b) => b._count._all - a._count._all)[0];

  if (totalCapturas > 0 && maiorFila) {
    groups.push({
      kind: "captura",
      count: totalCapturas,
      title: totalCapturas === 1 ? "Recorte aguardando" : "Recortes aguardando",
      meta: `Capturados e ainda não viraram questão · ${plural(capturas.length, "livro", "livros")}`,
      cta: "Abrir a fila",
      href: `/publications/${maiorFila.publicationId}/ingestao`,
    });
  }

  const primeiroVazio = semQuestoes[0];
  if (primeiroVazio) {
    groups.push({
      kind: "sem-questoes",
      count: semQuestoes.length,
      title: semQuestoes.length === 1 ? "Livro sem questões" : "Livros sem questões",
      meta:
        semQuestoes.length === 1
          ? primeiroVazio.title
          : `Começando por ${primeiroVazio.title}`,
      cta: "Começar",
      href: `/publications/${primeiroVazio.id}`,
    });
  }

  return groups;
}

/**
 * As bibliotecas com o suficiente para escolher uma.
 *
 * Três `groupBy` e uma listagem, não uma consulta por biblioteca: com quarenta bibliotecas na tela
 * — que é o caso real deste banco — o N+1 apareceria como meio segundo de Home em branco.
 */
async function readLibraryRows(): Promise<readonly HomeLibraryRow[]> {
  const [rows, questoes, invalidas] = await Promise.all([
    prisma.workspace.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        slug: true,
        updatedAt: true,
        _count: { select: { publications: true } },
      },
    }),
    prisma.documentNode.groupBy({
      by: ["publicationId"],
      where: { deletedAt: null, questionId: { not: null } },
      _count: { _all: true },
    }),
    prisma.documentNode.groupBy({
      by: ["publicationId"],
      where: { deletedAt: null, question: { validationStatus: "INVALID" } },
      _count: { _all: true },
    }),
  ]);

  // `groupBy` agrupa por publicação; a tela fala de biblioteca. O de-para sai de uma consulta só.
  const donoDaPublicacao = new Map(
    (
      await prisma.publication.findMany({ select: { id: true, workspaceId: true } })
    ).map((row) => [row.id, row.workspaceId]),
  );

  const somarPorBiblioteca = (
    grupos: readonly { publicationId: string; _count: { _all: number } }[],
  ): Map<string, number> => {
    const total = new Map<string, number>();
    for (const grupo of grupos) {
      const workspaceId = donoDaPublicacao.get(grupo.publicationId);
      if (!workspaceId) continue;
      total.set(workspaceId, (total.get(workspaceId) ?? 0) + grupo._count._all);
    }
    return total;
  };

  const porBiblioteca = somarPorBiblioteca(questoes);
  const invalidasPorBiblioteca = somarPorBiblioteca(invalidas);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    publicationCount: row._count.publications,
    questionCount: porBiblioteca.get(row.id) ?? 0,
    invalidCount: invalidasPorBiblioteca.get(row.id) ?? 0,
    updatedAt: row.updatedAt,
  }));
}

const plural = (n: number, um: string, muitos: string): string =>
  `${n} ${n === 1 ? um : muitos}`;

/**
 * Quantas questões vivas cada publicação tem, numa consulta só.
 *
 * `groupBy` e não uma contagem por livro: seis consultas para desenhar seis linhas é o tipo de
 * N+1 que não dói com seis e dói com sessenta.
 */
async function countQuestionsByPublication(ids: readonly string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();

  const groups = await prisma.documentNode.groupBy({
    by: ["publicationId"],
    where: { publicationId: { in: [...ids] }, deletedAt: null, questionId: { not: null } },
    _count: { _all: true },
  });

  return new Map(groups.map((group) => [group.publicationId, group._count._all]));
}

/**
 * Sobe a árvore montando o caminho legível.
 *
 * Profundidade limitada de propósito: um livro tem parte › capítulo › seção › grupo, e cinco
 * níveis já é mais do que qualquer sumário real. O teto também é o que impede um ciclo — que a
 * árvore proíbe, mas que uma linha corrompida poderia introduzir — de virar laço infinito numa
 * consulta de tela inicial.
 */
async function pathOf(parentId: string | null, leaf: string): Promise<string> {
  const parts: string[] = [leaf];

  let current = parentId;
  for (let depth = 0; depth < 5 && current !== null; depth++) {
    const node: { title: string | null; parentId: string | null } | null =
      await prisma.documentNode.findUnique({
        where: { id: current },
        select: { title: true, parentId: true },
      });
    if (!node) break;

    if (node.title) parts.unshift(node.title);
    current = node.parentId;
  }

  return parts.join(" › ");
}
