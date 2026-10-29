"use client";

import type {
  QuestionDetailResponse,
  RevisionDetailResponse,
  RevisionListResponse,
  SaveQuestionResponse,
} from "@modules/questions/application/question-contract";
import type { QuestionMetadata } from "@modules/questions/domain/question-metadata";
import type { QuestionStatus, QuestionType } from "@modules/questions/domain/question-type";
import { readLenientReply, readReply, type JsonReply } from "@/shared/http/api-client";

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

/** Texto, ou `null`: o corpo da recusa é de quem respondeu, e pode não trazer o campo. */
const textOrNull = (value: unknown): string | null => (typeof value === "string" ? value : null);

/**
 * O `PATCH` lido sem lançar: corpo que não é JSON não derruba a gravação, porque o status já diz o
 * que aconteceu. Só a rede fora lança.
 */
const patch = (
  publicationId: string,
  questionId: string,
  edit: QuestionEdit,
): Promise<JsonReply<SaveQuestionResponse>> =>
  readLenientReply<SaveQuestionResponse>(questionUrl(publicationId, questionId), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(edit),
  });

export const questionApi = {
  /** Os metadados crus, para a aba que os edita. `null` quando a rota não os devolveu. */
  async metadata(publicationId: string, questionId: string): Promise<QuestionMetadata | null> {
    const { body } = await readReply<QuestionDetailResponse>(
      questionUrl(publicationId, questionId),
    );
    // A rota manda a dificuldade como o número da coluna (ver `QuestionMetadataDto`); a tela
    // sempre a tratou como `Difficulty`, e continua tratando — o estreitamento fica só aqui.
    return (body.metadata as QuestionMetadata | undefined) ?? null;
  },

  async save(publicationId: string, questionId: string, edit: QuestionEdit): Promise<SaveOutcome> {
    const reply = await patch(publicationId, questionId, edit);

    if (reply.status === 409) {
      return { kind: "conflict", message: textOrNull(reply.body.message) };
    }
    if (!reply.ok) {
      return { kind: "failed", status: reply.status, message: textOrNull(reply.body.message) };
    }
    return { kind: "saved", version: textOrNull(reply.body.version) };
  },

  /**
   * *Conferido*: a questão sai de rascunho e vai para pronta. A tela recarrega depois, com
   * sucesso ou recusa — por isso a resposta não decide nada aqui.
   */
  confirm: (publicationId: string, questionId: string, expectedVersion: string) =>
    patch(publicationId, questionId, { expectedVersion, status: "READY" }),

  /**
   * Trocar o tipo muda a forma da questão — some ou volta uma aba inteira —, e a tela recarrega
   * depois, com sucesso ou recusa.
   */
  changeType: (
    publicationId: string,
    questionId: string,
    expectedVersion: string,
    type: QuestionType,
  ) => patch(publicationId, questionId, { expectedVersion, type }),

  async revisions(questionId: string): Promise<RevisionListResponse["revisions"]> {
    const { body } = await readReply<RevisionListResponse>(
      `/api/questions/${questionId}/revisions`,
    );
    return body.revisions ?? [];
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
    const { body } = await readReply<RevisionDetailResponse>(
      `/api/questions/${questionId}/revisions?revision=${revisionNumber}`,
    );
    if (!body.snapshot || !body.current) return null;
    return { snapshot: body.snapshot, current: body.current };
  },
};
