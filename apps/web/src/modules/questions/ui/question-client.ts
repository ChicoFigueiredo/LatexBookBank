"use client";

import type {
  QuestionDetailResponse,
  RevisionDetailResponse,
  RevisionListResponse,
  SaveQuestionResponse,
} from "@modules/questions/application/question-contract";
import type { QuestionMetadata } from "@modules/questions/domain/question-metadata";
import type { QuestionStatus, QuestionType } from "@modules/questions/domain/question-type";

/**
 * As rotas da questão que o editor usa, tipadas pelo contrato que elas mesmas anotam.
 *
 * Cada função preserva o que a tela fazia com a resposta: as leituras toleram corpo sem o campo
 * (devolvem `null`), e a gravação devolve o desfecho em vez de lançar, porque o autosave trata
 * conflito, recusa e falha de rede de jeitos diferentes.
 */

/** O corpo do `PATCH`: só o que mudou, sempre com a versão que a tela tinha. */
export interface QuestionEdit extends Partial<QuestionMetadata> {
  readonly expectedVersion: string;
  readonly statementLatex?: string;
  readonly solutionLatex?: string;
  readonly complementLatex?: string;
  readonly type?: QuestionType;
  readonly status?: QuestionStatus;
}

/** O desfecho de uma gravação. Rede fora não é desfecho: sobe como o erro do `fetch`. */
export type SaveOutcome =
  | { readonly kind: "saved"; readonly version: string | null }
  | { readonly kind: "conflict"; readonly message: string | null }
  | { readonly kind: "failed"; readonly status: number; readonly message: string | null };

const questionUrl = (publicationId: string, questionId: string) =>
  `/api/publications/${publicationId}/questions/${questionId}`;

/** Lê um campo de texto de um corpo que pode não ser objeto, nem JSON. */
function readString(payload: unknown, key: string): string | null {
  if (typeof payload !== "object" || payload === null || !(key in payload)) return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

export const questionApi = {
  /** Os metadados crus, para a aba que os edita. `null` quando a rota não os devolveu. */
  async metadata(publicationId: string, questionId: string): Promise<QuestionMetadata | null> {
    const response = await fetch(questionUrl(publicationId, questionId));
    const payload = (await response.json()) as Partial<QuestionDetailResponse>;
    // A rota manda a dificuldade como o número da coluna (ver `QuestionMetadataDto`); a tela
    // sempre a tratou como `Difficulty`, e continua tratando — o estreitamento fica só aqui.
    return (payload.metadata as QuestionMetadata | undefined) ?? null;
  },

  async save(publicationId: string, questionId: string, edit: QuestionEdit): Promise<SaveOutcome> {
    const response = await fetch(questionUrl(publicationId, questionId), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(edit),
    });
    // Corpo que não é JSON não derruba a gravação: o status já diz o que aconteceu.
    const payload: unknown = await response.json().catch(() => null);

    if (response.status === 409) {
      return { kind: "conflict", message: readString(payload, "message") };
    }
    if (!response.ok) {
      return { kind: "failed", status: response.status, message: readString(payload, "message") };
    }
    return {
      kind: "saved",
      version: readString(payload, "version" satisfies keyof SaveQuestionResponse),
    };
  },

  /**
   * Grava e não lê a resposta: os gestos que usam isto (trocar o tipo, *Conferido*) recarregam a
   * página em seguida, com sucesso ou recusa.
   */
  async patchAndForget(publicationId: string, questionId: string, edit: QuestionEdit) {
    await fetch(questionUrl(publicationId, questionId), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(edit),
    });
  },

  async revisions(questionId: string): Promise<RevisionListResponse["revisions"]> {
    const response = await fetch(`/api/questions/${questionId}/revisions`);
    const payload = (await response.json()) as Partial<RevisionListResponse>;
    return payload.revisions ?? [];
  },

  /** A revisão e o estado atual; `null` quando falta um dos dois lados. */
  async revision(
    questionId: string,
    revisionNumber: number,
  ): Promise<
    | (Required<Pick<RevisionDetailResponse, "snapshot">> & {
        readonly current: NonNullable<RevisionDetailResponse["current"]>;
      })
    | null
  > {
    const response = await fetch(
      `/api/questions/${questionId}/revisions?revision=${revisionNumber}`,
    );
    const payload = (await response.json()) as Partial<RevisionDetailResponse>;
    if (!payload.snapshot || !payload.current) return null;
    return { snapshot: payload.snapshot, current: payload.current };
  },
};
