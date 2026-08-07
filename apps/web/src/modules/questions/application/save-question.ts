import { ConcurrencyConflictError } from "@/shared/ports/repository";
import type {
  QuestionEdit,
  QuestionRepository,
  QuestionSnapshot,
} from "@modules/questions/domain/question-repository";

/**
 * Salvar uma questão sem perder trabalho de ninguém.
 *
 * A regra inviolável da spec §42 é curta: **conflito nunca sobrescreve em silêncio**. O autosave
 * da Fase 3 dispara sozinho, a cada pausa na digitação — se ele aceitasse gravar por cima do que
 * outro processo mudou, a perda aconteceria sem nenhum gesto do usuário e sem nenhum aviso.
 *
 * "Outro processo" não é hipótese distante mesmo em single-user (D21): o agente aplica patch, a
 * importação atualiza em lote, e a mesma questão pode estar aberta em duas abas.
 */

export class QuestionNotFoundError extends Error {
  constructor(readonly questionId: string) {
    super(`Questão ${questionId} não existe.`);
    this.name = "QuestionNotFoundError";
  }
}

export interface SaveQuestionCommand {
  readonly questionId: string;
  /** `updatedAt` que o cliente tinha quando começou a editar. */
  readonly expectedUpdatedAt: Date;
  readonly edit: QuestionEdit;
}

export interface SaveQuestionResult {
  readonly snapshot: QuestionSnapshot;
  /** `false` quando nada mudou de fato — o autosave disparou sem edição. */
  readonly written: boolean;
}

/** Campos que a edição realmente muda. Vazio significa que não há o que gravar. */
function changedFields(current: QuestionSnapshot, edit: QuestionEdit): (keyof QuestionEdit)[] {
  const keys: (keyof QuestionEdit)[] = [
    "statementLatex",
    "solutionLatex",
    "complementLatex",
    "nickname",
  ];
  return keys.filter((key) => edit[key] !== undefined && edit[key] !== current[key]);
}

export async function saveQuestion(
  repository: QuestionRepository,
  command: SaveQuestionCommand,
): Promise<SaveQuestionResult> {
  const current = await repository.findById(command.questionId);
  if (!current) throw new QuestionNotFoundError(command.questionId);

  // O conflito é verificado **antes** do atalho de "nada mudou". Trocar a ordem faria um
  // autosave sem alterações passar batido sobre uma linha que já mudou, e o cliente continuaria
  // achando que está com a versão corrente — até a próxima edição sobrescrever de verdade.
  if (current.updatedAt.getTime() !== command.expectedUpdatedAt.getTime()) {
    throw new ConcurrencyConflictError(
      "Question",
      command.questionId,
      command.expectedUpdatedAt.toISOString(),
      current.updatedAt.toISOString(),
    );
  }

  // O autosave dispara por tempo, não por mudança: sem esta guarda, cada pausa na digitação
  // gravaria de novo o mesmo texto e empurraria o `updatedAt` para frente — invalidando a versão
  // que as outras abas têm em mãos, sem que nada tenha mudado.
  if (changedFields(current, command.edit).length === 0) {
    return { snapshot: current, written: false };
  }

  const saved = await repository.updateIfUnchanged(
    command.questionId,
    command.expectedUpdatedAt,
    command.edit,
  );

  // Perdeu a corrida entre a leitura e a escrita. A cláusula do UPDATE pegou, e nada foi gravado.
  if (!saved) {
    const latest = await repository.findById(command.questionId);
    throw new ConcurrencyConflictError(
      "Question",
      command.questionId,
      command.expectedUpdatedAt.toISOString(),
      latest ? latest.updatedAt.toISOString() : "desconhecida",
    );
  }

  return { snapshot: saved, written: true };
}
