import { DIFFICULTIES, QUESTION_TYPES, type Difficulty, type QuestionType } from "./question-type";

/**
 * A pergunta que se faz ao acervo — **sem dizer como responder**.
 *
 * O tipo mora no domínio e não conhece SQL, FTS5 nem `tsvector`. É o que permite trocar o motor
 * de busca sem tocar em caso de uso: hoje o SQLite responde com `LIKE`, amanhã o PostgreSQL pode
 * responder com full-text, e a diferença fica inteira dentro do adaptador.
 *
 * Um `QuestionSearchService` que aceitasse string de SQL seria o contrário: o motor vazaria para
 * quem chama, e a Fase 6.5 teria descoberto isso tarde.
 *
 * Ver spec §12 · issue #113.
 */

export interface SearchQuery {
  /** Texto livre. Vazio significa "sem filtro de texto", não "nada". */
  readonly text: string;
  /** Todas as tags precisam bater — `E`, não `OU` (mesma regra do filtro da árvore). */
  readonly tags: readonly string[];
  readonly boards: readonly string[];
  readonly institutions: readonly string[];
  readonly years: readonly number[];
  readonly types: readonly QuestionType[];
  readonly difficulties: readonly Difficulty[];
  readonly limit: number;
  readonly offset: number;
}

export const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export const EMPTY_QUERY: SearchQuery = {
  text: "",
  tags: [],
  boards: [],
  institutions: [],
  years: [],
  types: [],
  difficulties: [],
  limit: DEFAULT_LIMIT,
  offset: 0,
};

export interface SearchHit {
  readonly id: string;
  readonly type: QuestionType;
  readonly title: string;
  /** Trecho do enunciado, já achatado. */
  readonly excerpt: string;
  readonly board: string | null;
  readonly year: number | null;
  readonly difficulty: Difficulty;
  readonly tags: readonly string[];
}

export interface SearchResult {
  readonly hits: readonly SearchHit[];
  /**
   * O total exato, ou `null` quando não foi contado.
   *
   * Medido: com `LIMIT 50`, a busca em 200 mil linhas leva **0,2 ms** — o banco para no
   * quinquagésimo acerto. O `COUNT(*)` da mesma consulta leva **85 ms**, porque varre tudo. O
   * caro nunca foi a busca; era a contagem que a acompanhava.
   *
   * Por isso a contagem só acontece quando é barata: se a página não encheu, o total é o número
   * de resultados e não custa consulta nenhuma. Se encheu, `hasMore` responde a pergunta que o
   * usuário de fato tem — "tem mais?" — sem pagar a varredura.
   */
  readonly total: number | null;
  /** `true` quando existe pelo menos mais um resultado além da página. */
  readonly hasMore: boolean;
}

export interface QuestionSearchService {
  search(query: SearchQuery): Promise<SearchResult>;
}

/**
 * Normaliza o que veio da tela ou da API.
 *
 * Recusa nada: valor inválido é **descartado**, não rejeitado. Uma busca é exploratória, e um ano
 * digitado errado no meio de cinco filtros não deve devolver erro — deve devolver o resultado dos
 * quatro que fazem sentido. Isso é o oposto do patch do agente, onde recusar é a regra.
 */
export function normalizeQuery(raw: Partial<Record<keyof SearchQuery, unknown>>): SearchQuery {
  return {
    text: typeof raw.text === "string" ? raw.text.trim().slice(0, 200) : "",
    tags: strings(raw.tags),
    boards: strings(raw.boards),
    institutions: strings(raw.institutions),
    years: numbers(raw.years).filter((year) => year >= 1900 && year <= 2100),
    types: strings(raw.types).filter((value): value is QuestionType =>
      (QUESTION_TYPES as readonly string[]).includes(value),
    ),
    difficulties: numbers(raw.difficulties).filter((value): value is Difficulty =>
      (DIFFICULTIES as readonly number[]).includes(value),
    ),
    limit: clamp(raw.limit, DEFAULT_LIMIT, 1, MAX_LIMIT),
    offset: clamp(raw.offset, 0, 0, 100_000),
  };
}

/** `true` quando a consulta não filtra nada — quem chama decide se vale listar tudo. */
export const isEmptyQuery = (query: SearchQuery): boolean =>
  query.text === "" &&
  query.tags.length === 0 &&
  query.boards.length === 0 &&
  query.institutions.length === 0 &&
  query.years.length === 0 &&
  query.types.length === 0 &&
  query.difficulties.length === 0;

/**
 * Quantos filtros estão ativos.
 *
 * A tela mostra este número no botão de filtros. Sem ele, um filtro esquecido explica um
 * resultado vazio que parece um acervo vazio — e a diferença entre as duas leituras é enorme para
 * quem está procurando uma questão que sabe que existe.
 */
export function activeFilterCount(query: SearchQuery): number {
  return (
    query.tags.length +
    query.boards.length +
    query.institutions.length +
    query.years.length +
    query.types.length +
    query.difficulties.length
  );
}

const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.flatMap((entry) =>
        typeof entry === "string" && entry.trim() !== "" ? [entry.trim()] : [],
      )
    : [];

const numbers = (value: unknown): number[] =>
  Array.isArray(value)
    ? value.flatMap((entry) => {
        const parsed = typeof entry === "string" ? Number(entry) : entry;
        return typeof parsed === "number" && Number.isInteger(parsed) ? [parsed] : [];
      })
    : [];

function clamp(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
