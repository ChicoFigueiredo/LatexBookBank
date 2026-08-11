import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";

import { buildWhere } from "./prisma-question-search-where";
import { isQuestionType, isDifficulty } from "@modules/questions/domain/question-type";
import type {
  QuestionSearchService,
  SearchHit,
  SearchQuery,
  SearchResult,
} from "@modules/questions/domain/search-query";

/**
 * A busca sobre o Prisma — **sem SQL cru**.
 *
 * `contains` e `AND`/`in` no `where`, e não `$queryRaw` com `MATCH`: o SQL de FTS5 não existe no
 * PostgreSQL, e escrevê-lo aqui amarraria a busca ao SQLite exatamente na fase que a 6.5
 * existiu para evitar. O adaptador é onde o motor pode mudar; o SQL cru seria o motor vazando
 * para dentro dele de forma que a troca vira reescrita.
 *
 * Quando o acervo crescer a ponto de `contains` doer, a resposta é um adaptador novo — não um
 * `if` aqui dentro. Ver o benchmark em `docs/_atual/search-benchmark.md`.
 *
 * Ver spec §12 · issue #113.
 */

const EXCERPT_CHARS = 180;

export class PrismaQuestionSearch implements QuestionSearchService {
  async search(query: SearchQuery): Promise<SearchResult> {
    const where = buildWhere(query);

    /**
     * Uma linha a mais que a página, e **nenhum `COUNT`**.
     *
     * Medido num corpus sintético de 200 mil questões: a busca com `LIMIT 50` leva 0,2 ms porque
     * o banco para no quinquagésimo acerto; o `COUNT(*)` da mesma condição leva 85 ms, porque
     * varre a tabela inteira. Pedir `limit + 1` responde "tem mais?" pelo preço de uma linha.
     *
     * Ver `docs/_atual/search-benchmark.md`.
     */
    const rows = await prisma.question.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: query.offset,
      take: query.limit + 1,
      select: {
        id: true,
        type: true,
        nickname: true,
        statementLatex: true,
        board: true,
        year: true,
        difficulty: true,
        tags: { select: { tag: { select: { name: true } } } },
      },
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;

    return {
      hits: page.map(toHit),
      // Exato só quando é de graça: sem página cheia, o total **é** o que veio.
      total: hasMore ? null : query.offset + page.length,
      hasMore,
    };
  }
}

function toHit(row: {
  id: string;
  type: string;
  nickname: string | null;
  statementLatex: string;
  board: string | null;
  year: number | null;
  difficulty: number;
  tags: { tag: { name: string } }[];
}): SearchHit {
  return {
    id: row.id,
    // O banco guarda `String` porque o conector SQLite não tem `enum`. Linha com tipo
    // desconhecido cai em discursiva **na exibição** — aqui, ao contrário do agente, adivinhar é
    // aceitável: uma busca que some um resultado é pior que uma que o mostra com rótulo errado.
    type: isQuestionType(row.type) ? row.type : "DISCURSIVE",
    title: row.nickname ?? "(sem apelido)",
    excerpt: excerptOf(row.statementLatex),
    board: row.board,
    year: row.year,
    difficulty: isDifficulty(row.difficulty) ? row.difficulty : 5,
    tags: row.tags.map((link) => link.tag.name),
  };
}

function excerptOf(statement: string): string {
  const flat = statement.replace(/\s+/g, " ").trim();
  return flat.length <= EXCERPT_CHARS ? flat : `${flat.slice(0, EXCERPT_CHARS)}…`;
}
