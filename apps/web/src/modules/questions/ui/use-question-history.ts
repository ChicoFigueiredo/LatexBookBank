"use client";

import { useCallback, useState } from "react";

import { agentApi } from "@modules/agents/ui/agent-client";
import type { QuestionFieldId } from "@modules/latex/domain/latex-language";
import { diffSnapshots, type RevisionChange } from "@modules/questions/domain/revision-diff";

import type { RevisionRow } from "./HistoryPanel";
import { questionApi } from "./question-client";

/**
 * O histórico da questão: a timeline, o diff da revisão escolhida e o restaurar.
 *
 * Saiu do `QuestionEditor` (ARQ-08 da revisão de 2026-09-23). O histórico é carregado **ao abrir
 * a aba**, não junto com a questão: uma questão editada cem vezes tem cem revisões, e trazê-las
 * com o editor faria toda abertura pagar por uma tela que quase nunca se abre.
 */
export interface QuestionHistoryOptions {
  readonly questionId: string;
  /**
   * O texto na tela. O diff usa estes três campos no lugar dos do banco: usar o valor gravado
   * esconderia do usuário justamente o que ele acabou de digitar.
   */
  readonly draft: Readonly<Record<QuestionFieldId, string>>;
  /** Depois de restaurar. No editor, recarregar a página inteira. */
  readonly onRestored: () => void;
}

export interface QuestionHistory {
  /** `null` até a aba pedir. */
  readonly revisions: readonly RevisionRow[] | null;
  readonly selected: number | null;
  /** O diff da revisão selecionada contra o estado atual. `null` enquanto carrega. */
  readonly changes: readonly RevisionChange[] | null;
  readonly load: () => Promise<void>;
  readonly select: (revisionNumber: number) => Promise<void>;
  readonly restore: (revisionNumber: number) => Promise<void>;
}

export function useQuestionHistory({
  questionId,
  draft,
  onRestored,
}: QuestionHistoryOptions): QuestionHistory {
  const [revisions, setRevisions] = useState<readonly RevisionRow[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [changes, setChanges] = useState<readonly RevisionChange[] | null>(null);

  const load = useCallback(async () => {
    setRevisions(await questionApi.revisions(questionId));
  }, [questionId]);

  /** O diff é da revisão contra o **estado atual** — é o que decide se vale restaurar. */
  const select = useCallback(
    async (revisionNumber: number) => {
      setSelected(revisionNumber);
      setChanges(null);

      const sides = await questionApi.revision(questionId, revisionNumber);
      if (sides === null) return;

      // Os dois lados vêm do servidor. Montar o "atual" a partir do editor mostraria alternativa,
      // metadado e tag como inalterados sempre — bem os campos onde o agente mais mexe.
      setChanges(
        diffSnapshots(sides.snapshot, {
          ...sides.current,
          // Exceto os três campos de texto, que podem ter edição não salva na tela.
          statementLatex: draft.statementLatex,
          solutionLatex: draft.solutionLatex,
          complementLatex: draft.complementLatex,
        }),
      );
    },
    [draft, questionId],
  );

  const restore = useCallback(
    async (revisionNumber: number) => {
      await agentApi.revertPatch({ questionId, revisionNumber });
      // Recarregar em vez de aplicar no estado local: restaurar mexe em alternativas, metadados e
      // tags, que esta tela não guarda — e um estado meio atualizado é pior que um recarregado.
      onRestored();
    },
    [onRestored, questionId],
  );

  return { revisions, selected, changes, load, select, restore };
}
