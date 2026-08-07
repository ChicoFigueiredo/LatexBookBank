/**
 * Porta do agregado `Question`.
 *
 * O agregado é a questão **com** suas alternativas: elas não existem sozinhas, e o gabarito só
 * faz sentido no conjunto. Salvar uma alternativa sem passar pela questão permitiria deixar duas
 * corretas sem que ninguém validasse — a inconsistência que a spec §8.5 mais teme.
 */

/** Campos que a edição pode tocar. Deliberadamente uma lista, não `Partial<Question>`. */
export interface QuestionEdit {
  readonly statementLatex?: string;
  readonly solutionLatex?: string;
  readonly complementLatex?: string;
  readonly nickname?: string | null;
}

export interface QuestionSnapshot {
  readonly id: string;
  readonly statementLatex: string;
  readonly solutionLatex: string;
  readonly complementLatex: string;
  readonly nickname: string | null;
  /**
   * Carimbo de versão. É `Date` e não número de revisão porque o Prisma já mantém `@updatedAt`
   * em toda linha — inventar um contador seria uma segunda fonte de verdade para a mesma coisa.
   */
  readonly updatedAt: Date;
}

export interface QuestionRepository {
  findById(questionId: string): Promise<QuestionSnapshot | null>;

  /**
   * Grava **somente se** `updatedAt` no banco ainda for `expectedUpdatedAt`.
   *
   * Devolve o snapshot novo quando gravou, e `null` quando a linha mudou desde a leitura. O
   * `null` é deliberado: quem chama precisa decidir o que fazer com o conflito, e uma exceção
   * lançada daqui esconderia a decisão dentro da infraestrutura.
   *
   * A comparação acontece **na cláusula do UPDATE**, não em código: ler, comparar e gravar em
   * três passos deixa uma janela entre a leitura e a escrita, que é exatamente o que a
   * concorrência otimista existe para fechar.
   */
  updateIfUnchanged(
    questionId: string,
    expectedUpdatedAt: Date,
    edit: QuestionEdit,
  ): Promise<QuestionSnapshot | null>;
}
