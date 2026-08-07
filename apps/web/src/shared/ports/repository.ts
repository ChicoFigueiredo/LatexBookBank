/**
 * Fronteira primária: **Persistência**.
 *
 * Não existe um `Repository<T>` genérico. Cada agregado declara a sua própria interface, no
 * `domain/` do módulo que a possui, com os métodos que aquele agregado realmente precisa:
 *
 * ```ts
 * // src/modules/questions/domain/question-repository.ts
 * export interface QuestionRepository {
 *   get(id: QuestionId): Promise<QuestionAggregate | null>;
 *   save(question: QuestionAggregate): Promise<void>;
 * }
 * ```
 *
 * Um `Repository<T>` com `findAll`/`findById`/`save` para todo agregado é exatamente a
 * "abstração de uma linha" que a auditoria §39 manda evitar: não descreve comportamento real e
 * empurra todo mundo para a mesma forma.
 *
 * As interfaces concretas chegam com o schema, na issue #6. Este arquivo carrega apenas o que é
 * genuinamente compartilhado entre elas.
 *
 * Ver `docs/_atual/_planejamento.md` §4.7 · D23 · D24.
 */

/**
 * Conflito de concorrência otimista.
 *
 * O planejamento é explícito: se a entidade mudou desde a leitura, detectar e apresentar —
 * **nunca sobrescrever em silêncio** (spec §20). Quem chama precisa distinguir isso de um erro
 * de escrita qualquer, por isso é um tipo próprio e não uma mensagem.
 */
export class ConcurrencyConflictError extends Error {
  constructor(
    readonly entityType: string,
    readonly entityId: string,
    readonly expectedVersion: Date | string,
    readonly actualVersion: Date | string,
  ) {
    super(
      `${entityType} ${entityId} mudou desde a leitura ` +
        `(esperado ${String(expectedVersion)}, encontrado ${String(actualVersion)})`,
    );
    this.name = "ConcurrencyConflictError";
  }
}

/**
 * Executa um bloco dentro de uma transação.
 *
 * Existe porque o fluxo agêntico exige atomicidade real: criar a revisão anterior e aplicar o
 * patch precisam acontecer juntos ou não acontecer (spec §24, §14.6). Sem isso, uma falha no
 * meio deixaria conteúdo alterado sem revisão para reverter.
 */
export interface TransactionRunner {
  run<T>(work: () => Promise<T>): Promise<T>;
}
