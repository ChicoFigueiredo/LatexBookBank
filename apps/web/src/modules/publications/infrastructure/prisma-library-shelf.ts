import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";
import {
  carimboDaLombada,
  formatarAutores,
  formatarEdicao,
} from "@modules/publications/domain/shelf-labels";

/**
 * A estante de uma biblioteca — o que a tabela de livros mostra (protótipo, 423–491).
 *
 * Read model e não repositório: o que a tela pede — autor, edição, quantas questões, em que pé
 * está, quando mexeram — atravessa três tabelas e não é o resumo que o `PublicationRepository`
 * serve aos casos de uso. Enfiar isso no `PublicationSummary` faria toda escrita de publicação
 * carregar contagens que ela descarta.
 *
 * A tabela substitui a grade de cards porque a decisão que ela apoia é **comparativa**: qual
 * livro tem questão pendente, qual está parado, qual foi mexido hoje. Card não alinha número, e
 * sem alinhamento não há comparação — só um mosaico bonito.
 */

/** Em que pé o livro está. A tela escolhe a cor; aqui só o fato. */
export type ShelfState = "sem-questoes" | "a-revisar" | "em-captura" | "pronto";

export interface ShelfBook {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string | null;
  /**
   * Como o usuário chama o livro — "FME 3".
   *
   * O campo existia no domínio, atravessava o exportador, e **nenhuma tela o escrevia ou o
   * mostrava**: um dado que o produto validava e o usuário nunca via. Aqui ele ganha o lugar onde
   * serve, que é a coluna onde se procura o livro.
   */
  readonly nickname: string | null;
  /** O carimbo da lombada: volume quando há, senão a inicial do título. */
  readonly mark: string;
  readonly authors: string | null;
  readonly edition: string | null;
  readonly questionCount: number;
  readonly invalidCount: number;
  readonly state: ShelfState;
  readonly updatedAt: Date;
}

export interface LibraryShelf {
  readonly books: readonly ShelfBook[];
  readonly questionTotal: number;
  /** Quando alguém mexeu por último em qualquer livro daqui. `null` na biblioteca vazia. */
  readonly lastActivity: Date | null;
}

export async function readLibraryShelf(workspaceId: string): Promise<LibraryShelf> {
  const rows = await prisma.publication.findMany({
    where: { workspaceId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      subtitle: true,
      nickname: true,
      volume: true,
      edition: true,
      editionYear: true,
      updatedAt: true,
      authors: {
        orderBy: { position: "asc" },
        select: { author: { select: { name: true } } },
      },
    },
  });

  const ids = rows.map((row) => row.id);

  // Três agregações, não três por livro: com sessenta livros o N+1 apareceria como a tela em
  // branco enquanto o SQLite responde sessenta vezes a mesma pergunta com o `id` trocado.
  const [questoes, invalidas, capturas] = await Promise.all([
    contarPorPublicacao(ids, { deletedAt: null, questionId: { not: null } }),
    contarPorPublicacao(ids, { deletedAt: null, question: { validationStatus: "INVALID" } }),
    contarAncorasPendentes(ids),
  ]);

  const books = rows.map((row): ShelfBook => {
    const questionCount = questoes.get(row.id) ?? 0;
    const invalidCount = invalidas.get(row.id) ?? 0;
    const pendentes = capturas.get(row.id) ?? 0;

    return {
      id: row.id,
      title: row.title,
      subtitle: row.subtitle,
      nickname: row.nickname,
      mark: carimboDaLombada(row.title, row.volume),
      authors: formatarAutores(row.authors.map((entry) => entry.author.name)),
      edition: formatarEdicao(row.edition, row.editionYear),
      questionCount,
      invalidCount,
      state: estadoDe({ questionCount, invalidCount, pendentes }),
      updatedAt: row.updatedAt,
    };
  });

  return {
    books,
    questionTotal: books.reduce((soma, book) => soma + book.questionCount, 0),
    lastActivity: rows[0]?.updatedAt ?? null,
  };
}

/**
 * A ordem das perguntas é a ordem da urgência.
 *
 * “A revisar” vem antes de “em captura” porque questão reprovada bloqueia a prova sair, enquanto
 * recorte na fila só significa trabalho pela frente. Um livro pode estar nos dois estados; a
 * pílula mostra o que decide a próxima ação.
 */
function estadoDe(facts: {
  questionCount: number;
  invalidCount: number;
  pendentes: number;
}): ShelfState {
  if (facts.invalidCount > 0) return "a-revisar";
  if (facts.pendentes > 0) return "em-captura";
  if (facts.questionCount === 0) return "sem-questoes";
  return "pronto";
}

async function contarPorPublicacao(
  ids: readonly string[],
  where: Record<string, unknown>,
): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();

  const grupos = await prisma.documentNode.groupBy({
    by: ["publicationId"],
    where: { publicationId: { in: [...ids] }, ...where },
    _count: { _all: true },
  });

  return new Map(grupos.map((grupo) => [grupo.publicationId, grupo._count._all]));
}

/** Recortes que ainda não viraram questão — a fila de captura, derivada (ver `capture-queue.ts`). */
async function contarAncorasPendentes(ids: readonly string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();

  const grupos = await prisma.sourceAnchor.groupBy({
    by: ["publicationId"],
    where: { publicationId: { in: [...ids] }, questions: { none: {} } },
    _count: { _all: true },
  });

  return new Map(grupos.map((grupo) => [grupo.publicationId, grupo._count._all]));
}
