import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";
import {
  DIFFICULTY_LABELS,
  isDifficulty,
  isQuestionType,
} from "@modules/questions/domain/question-type";
import type { QuestionType, ValidationStatus } from "@modules/questions/domain/question-type";

import type {
  AgentAnchorView,
  AgentDiagnosticView,
  AgentMetadataView,
  AgentOptionView,
  AgentQuestionView,
  AgentReadPort,
  AgentRenderView,
  AgentSearchHit,
} from "@modules/agents/application/agent-read-port";

/**
 * A porta de leitura do agente, sobre o Prisma.
 *
 * **Só `findUnique` e `findMany`.** Não há um método de escrita neste arquivo, e o teste de
 * guarda varre o módulo inteiro para garantir que continue assim. A porta ser estreita é o que
 * torna "o agente nunca escreve no banco" uma propriedade do tipo, e não da disciplina de quem
 * escreve a próxima tool.
 *
 * ## Por que este arquivo não mora em `modules/agents/`
 *
 * Porque o lint recusa: `boundary/agents` proíbe o módulo do agente de alcançar a camada de
 * banco, e recusou este import quando ele estava lá. A regra está certa e a recusa foi útil — o
 * módulo do agente continua sem qualquer caminho até o Prisma, e quem liga os dois é a
 * composição, do lado de fora, onde a escolha fica visível.
 *
 * Ver spec §35 · issue #95.
 */

/** Alternativas em `sortKey` — a ordem é o que projeta a letra (D9/§8.5). */
const OPTION_ORDER = { sortKey: "asc" } as const;

const EXCERPT_CHARS = 160;

export class PrismaAgentReadPort implements AgentReadPort {
  async getQuestion(questionId: string): Promise<AgentQuestionView | null> {
    const row = await prisma.question.findUnique({
      where: { id: questionId },
      select: {
        id: true,
        type: true,
        nickname: true,
        statementLatex: true,
        solutionLatex: true,
        complementLatex: true,
        status: true,
        validationStatus: true,
        tags: { select: { tag: { select: { name: true } } } },
      },
    });
    if (!row) return null;

    return {
      id: row.id,
      // O banco guarda `String` porque o conector SQLite não tem `enum`. Uma linha com tipo
      // desconhecido é dado corrompido — e cair em `DISCURSIVE` faria o agente responder sobre
      // uma questão que não é essa.
      type: coerceType(row.type, row.id),
      nickname: row.nickname,
      statementLatex: row.statementLatex,
      solutionLatex: row.solutionLatex,
      complementLatex: row.complementLatex,
      status: row.status,
      validationStatus: row.validationStatus as ValidationStatus,
      tags: row.tags.map((link) => link.tag.name),
    };
  }

  async getOptions(questionId: string): Promise<readonly AgentOptionView[]> {
    return prisma.questionOption.findMany({
      where: { questionId },
      orderBy: OPTION_ORDER,
      select: { id: true, statementLatex: true, isCorrect: true },
    });
  }

  async getMetadata(questionId: string): Promise<AgentMetadataView | null> {
    const row = await prisma.question.findUnique({
      where: { id: questionId },
      select: {
        difficulty: true,
        year: true,
        board: true,
        institution: true,
        role: true,
        roleLevel: true,
        publisher: true,
        videoUrl: true,
      },
    });
    if (!row) return null;

    return {
      ...row,
      // A escala legada é 0 · 2 · 5 · 7 · 10. Um valor fora dela vem de import antigo; mostrar o
      // número cru é melhor que inventar um rótulo.
      difficultyLabel: isDifficulty(row.difficulty)
        ? DIFFICULTY_LABELS[row.difficulty]
        : `fora da escala (${row.difficulty})`,
    };
  }

  async getSourceAnchor(questionId: string): Promise<AgentAnchorView | null> {
    const row = await prisma.question.findUnique({
      where: { id: questionId },
      select: {
        sourceAnchor: {
          select: {
            publicationId: true,
            pageNumber: true,
            xNormalized: true,
            yNormalized: true,
            widthNormalized: true,
            heightNormalized: true,
            sourceText: true,
            extractionMethod: true,
            extractionModel: true,
          },
        },
      },
    });

    const anchor = row?.sourceAnchor;
    if (!anchor) return null;

    return {
      publicationId: anchor.publicationId,
      pageNumber: anchor.pageNumber,
      box: {
        x: anchor.xNormalized,
        y: anchor.yNormalized,
        width: anchor.widthNormalized,
        height: anchor.heightNormalized,
      },
      sourceText: anchor.sourceText,
      extractionMethod: anchor.extractionMethod,
      extractionModel: anchor.extractionModel,
    };
  }

  async getLatestRender(questionId: string): Promise<AgentRenderView | null> {
    const row = await prisma.renderJob.findFirst({
      where: { questionId },
      // O índice `[questionId, createdAt]` existe exatamente para esta consulta.
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        state: true,
        success: true,
        durationMs: true,
        createdAt: true,
        diagnosticsJson: true,
      },
    });
    if (!row) return null;

    return {
      jobId: row.id,
      state: row.state,
      success: row.success,
      durationMs: row.durationMs,
      finishedAt: row.createdAt,
      diagnostics: parseDiagnostics(row.diagnosticsJson),
    };
  }

  async searchQuestions(query: string, limit: number): Promise<readonly AgentSearchHit[]> {
    const rows = await prisma.question.findMany({
      // `contains` e não SQL cru: uma tool com SQL arbitrário é uma tool de escrita disfarçada de
      // leitura. Busca boa de verdade chega na Fase 12, com índice — não por aqui.
      where: { statementLatex: { contains: query } },
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: { id: true, type: true, nickname: true, statementLatex: true },
    });

    return rows.map((row) => ({
      id: row.id,
      type: coerceType(row.type, row.id),
      title: row.nickname ?? "(sem apelido)",
      excerpt: excerptOf(row.statementLatex),
    }));
  }
}

function coerceType(raw: string, questionId: string): QuestionType {
  if (!isQuestionType(raw)) {
    throw new Error(`Questão ${questionId} tem tipo desconhecido no banco: ${raw}`);
  }
  return raw;
}

/**
 * Um enunciado inteiro num resultado de busca encheria a janela com dez questões que o modelo
 * não pediu. O trecho é cru — desmontar LaTeX aqui seria refazer o parser da Fase 5 por engano.
 */
function excerptOf(statement: string): string {
  const flat = statement.replace(/\s+/g, " ").trim();
  return flat.length <= EXCERPT_CHARS ? flat : `${flat.slice(0, EXCERPT_CHARS)}…`;
}

/**
 * `diagnosticsJson` é texto porque o conector SQLite não tem `Json`.
 *
 * JSON inválido devolve lista vazia em vez de derrubar a tool: o agente perguntou pelos
 * diagnósticos de um render, e um job com coluna corrompida não é motivo para o turno inteiro
 * falhar — a resposta "nenhum diagnóstico" é imprecisa, mas o erro cru não ajudaria ninguém.
 */
function parseDiagnostics(raw: string): readonly AgentDiagnosticView[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return parsed.flatMap((entry): AgentDiagnosticView[] => {
    if (typeof entry !== "object" || entry === null) return [];
    const record = entry as Record<string, unknown>;

    const message = typeof record["message"] === "string" ? record["message"] : null;
    if (message === null) return [];

    return [
      {
        severity: typeof record["severity"] === "string" ? record["severity"] : "info",
        message,
        ...(typeof record["file"] === "string" ? { file: record["file"] } : {}),
        ...(typeof record["line"] === "number" ? { line: record["line"] } : {}),
      },
    ];
  });
}
