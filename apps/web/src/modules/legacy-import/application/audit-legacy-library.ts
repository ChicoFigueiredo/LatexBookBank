import { checkInvariants, type InvariantViolation } from "../domain/import-invariants";
import type { LegacyLibraryReader } from "../domain/legacy-library-reader";

/**
 * Lê uma biblioteca e confere as três invariantes que dá para checar **antes** de qualquer
 * escrita (gabarito único, pai existente, sem ciclo — a quarta, idempotência, só se prova
 * comparando duas execuções do import de verdade).
 *
 * Ver checklist Fase 11, blocos "Scanner" e "Invariantes afirmadas".
 */

export interface LegacyLibraryAudit {
  readonly counts: {
    readonly questions: number;
    readonly options: number;
  };
  readonly violations: readonly InvariantViolation[];
}

export async function auditLegacyLibrary(reader: LegacyLibraryReader): Promise<LegacyLibraryAudit> {
  const contents = await reader.read();

  const violations = checkInvariants({
    nodes: contents.questions.map((question) => ({
      IdQuestao: question.IdQuestao,
      IdQuestao_Pai: question.IdQuestao_Pai,
      TipoQuestao: question.TipoQuestao,
    })),
    options: contents.options.map((option) => ({
      IdQuestao: option.IdQuestao,
      Correta: option.Correta,
    })),
  });

  return {
    counts: {
      questions: contents.questions.length,
      options: contents.options.length,
    },
    violations,
  };
}
