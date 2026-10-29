/**
 * A questão não existe, ou não é da publicação da URL — e a resposta não diz qual dos dois.
 *
 * Um erro, e não o `null` que cada rota traduzia: o bloco "`null` → 404" estava colado em oito
 * rotas, e uma delas já respondia outro código (STE-10). Mapeado uma vez, no tradutor de erros.
 *
 * Num arquivo sem banco: o tradutor importa a classe, e não deve carregar o cliente Prisma por isso.
 */
export class QuestionOutOfScopeError extends Error {
  constructor(readonly questionId: string) {
    super(`Questão ${questionId} não existe nesta publicação.`);
    this.name = "QuestionOutOfScopeError";
  }
}
