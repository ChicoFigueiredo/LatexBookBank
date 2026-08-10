import type { QuestionType, ValidationStatus } from "@modules/questions/domain/question-type";

/**
 * Tudo que o agente pode **ler** — e a ausência é o desenho.
 *
 * Não há `save`, `update`, `delete` nem `query`. A porta inteira é a superfície do agente sobre o
 * banco, e ela só tem verbos de leitura. Fosse uma porta genérica com um método `run(sql)`, a
 * regra "o agente nunca escreve" viraria uma questão de disciplina em cada chamada; assim ela é
 * uma questão de tipo, verificada pelo compilador.
 *
 * Ver spec §35 · issue #95.
 */

export interface AgentQuestionView {
  readonly id: string;
  readonly type: QuestionType;
  readonly nickname: string | null;
  readonly statementLatex: string;
  readonly solutionLatex: string;
  readonly complementLatex: string;
  readonly status: string;
  readonly validationStatus: ValidationStatus;
  readonly tags: readonly string[];
}

export interface AgentOptionView {
  readonly id: string;
  readonly statementLatex: string;
  readonly isCorrect: boolean;
}

export interface AgentMetadataView {
  readonly difficulty: number;
  readonly difficultyLabel: string;
  readonly year: number | null;
  readonly board: string | null;
  readonly institution: string | null;
  readonly role: string | null;
  readonly roleLevel: string | null;
  readonly publisher: string | null;
  readonly videoUrl: string | null;
}

/** Onde a questão estava na origem — página, recorte, texto extraído (spec §18). */
export interface AgentAnchorView {
  readonly publicationId: string;
  readonly pageNumber: number;
  readonly box: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly sourceText: string | null;
  readonly extractionMethod: string | null;
  readonly extractionModel: string | null;
}

export interface AgentDiagnosticView {
  readonly severity: string;
  readonly message: string;
  readonly file?: string;
  readonly line?: number;
}

export interface AgentRenderView {
  readonly jobId: string;
  readonly state: string;
  readonly success: boolean;
  readonly durationMs: number;
  readonly finishedAt: Date | null;
  readonly diagnostics: readonly AgentDiagnosticView[];
}

export interface AgentSearchHit {
  readonly id: string;
  readonly type: QuestionType;
  readonly title: string;
  readonly excerpt: string;
}

export interface AgentReadPort {
  getQuestion(questionId: string): Promise<AgentQuestionView | null>;
  getOptions(questionId: string): Promise<readonly AgentOptionView[]>;
  getMetadata(questionId: string): Promise<AgentMetadataView | null>;
  getSourceAnchor(questionId: string): Promise<AgentAnchorView | null>;
  /** O render mais recente, ou `null` se a questão nunca foi compilada. */
  getLatestRender(questionId: string): Promise<AgentRenderView | null>;
  searchQuestions(query: string, limit: number): Promise<readonly AgentSearchHit[]>;
}
