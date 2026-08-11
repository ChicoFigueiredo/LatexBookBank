import type { RenderDiagnostic, RenderProfile } from "@latexbookbank/render-contract";
import { buildRenderBundle } from "@modules/rendering/domain/build-render-bundle";
import type { QuestionForRender } from "@modules/rendering/domain/build-render-bundle";
import type { RenderExecutor } from "@/shared/ports";

import { truncateOutput, type AgentTool } from "../domain/tool-contract";

/**
 * `render_candidate_latex` — compila para **conferir**, não para guardar.
 *
 * O caminho normal de render grava `RenderJob` e sobe os artefatos para o `StorageProvider`. Fazer
 * isso a cada tentativa do agente encheria o banco de compilações que ninguém abre duas vezes — e,
 * pior, daria a ele um caminho de escrita por via indireta, contornando a regra de que o agente
 * propõe e o humano aplica.
 *
 * Aqui o executor é usado direto (D35: ele recebe o bundle e devolve bytes, sem persistir), os
 * bytes são descartados e só os **diagnósticos** voltam. É o bastante para o agente saber se o
 * LaTeX que ele escreveu compila, que é a única pergunta que ele precisa fazer.
 *
 * Ver spec §35 · issue #105.
 */

export interface CandidateRenderDeps {
  readonly executor: RenderExecutor;
  readonly profile: RenderProfile;
  /** A questão em foco, para compilar o candidato no contexto dela. */
  readonly loadQuestion: () => Promise<QuestionForRender | null>;
}

/** Só o resultado da compilação — nenhum artefato atravessa. */
export interface CandidateRenderOutcome {
  readonly success: boolean;
  readonly durationMs: number;
  readonly diagnostics: readonly RenderDiagnostic[];
}

/**
 * O teto de tentativas por turno.
 *
 * Compilar é caro em segundos, não em bytes: um `pdflatex` leva de meio a três segundos, e um
 * modelo que se enrosca chamaria isto em toda rodada. Três é o bastante para "compilei, li o
 * erro, corrigi".
 */
export const MAX_CANDIDATE_RENDERS = 3;

export function buildCandidateRenderTool(deps: CandidateRenderDeps): AgentTool {
  let used = 0;

  return {
    name: "render_candidate_latex",
    description:
      "Compila um LaTeX candidato para conferir se ele funciona. Devolve erros e avisos do " +
      "compilador. Não altera nada — serve para você testar antes de propor.",
    inputSchema: {
      type: "object",
      properties: {
        field: {
          type: "string",
          enum: ["statementLatex", "solutionLatex", "complementLatex"],
          description: "Qual campo o candidato substitui na compilação.",
        },
        value: { type: "string", description: "O LaTeX candidato, completo." },
      },
      required: ["field", "value"],
      additionalProperties: false,
    },

    execute: async (input) => {
      if (used >= MAX_CANDIDATE_RENDERS) {
        return `Você já compilou ${MAX_CANDIDATE_RENDERS} vezes neste turno. Proponha o que tem.`;
      }

      const { field, value } = parseInput(input);

      const question = await deps.loadQuestion();
      if (question === null) return "Nenhuma questão está aberta para compilar o candidato.";

      used += 1;

      // A questão inteira, com o campo substituído: compilar o trecho sozinho esconderia erro de
      // ambiente aberto num campo e fechado em outro, que é justamente o que costuma quebrar.
      const candidate: QuestionForRender = { ...question, [field]: value };

      const bundle = buildRenderBundle({
        // `jobId` só para o worker nomear o diretório temporário — nada é gravado com ele.
        jobId: `candidate-${used}`,
        question: candidate,
        profile: deps.profile,
        includeSolution: field !== "statementLatex",
      });

      const started = Date.now();
      // Sem assets: o candidato é texto, e uma figura que já existe na questão não muda o que se
      // quer saber aqui — se o LaTeX compila. Resolver assets custaria uma leitura de storage por
      // tentativa, e o agente pode tentar três vezes.
      const { result } = await deps.executor.render(bundle, new Map());
      const durationMs = Date.now() - started;

      return truncateOutput(
        formatOutcome({ success: result.success, durationMs, diagnostics: result.diagnostics }),
      );
    },
  };
}

export function formatOutcome(outcome: CandidateRenderOutcome): string {
  const head = `${outcome.success ? "Compilou" : "**Não** compilou"} em ${outcome.durationMs} ms.`;

  const relevant = outcome.diagnostics.filter((entry) => entry.severity !== "info");
  if (relevant.length === 0) {
    // Sem erro nem aviso, dizer isso explicitamente evita o modelo concluir que a saída veio
    // truncada e tentar de novo.
    return `${head} Nenhum erro ou aviso.`;
  }

  return [
    head,
    "",
    ...relevant.map((entry) => {
      // `null` e não `undefined`: o contrato de render declara os dois campos como anuláveis, e
      // comparar com `undefined` faria a condição valer sempre — imprimindo `(null)` no lugar do
      // arquivo. Foi o tipo que apontou.
      const where =
        entry.file !== null ? ` (${entry.file}${entry.line !== null ? `:${entry.line}` : ""})` : "";
      return `[${entry.severity}]${where} ${entry.message}`;
    }),
  ].join("\n");
}

const FIELDS = new Set(["statementLatex", "solutionLatex", "complementLatex"]);

function parseInput(input: unknown): { field: keyof QuestionForRender; value: string } {
  const record =
    typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};

  const field = record["field"];
  const value = record["value"];

  if (typeof field !== "string" || !FIELDS.has(field)) {
    throw new Error("`field` precisa ser statementLatex, solutionLatex ou complementLatex.");
  }
  if (typeof value !== "string") throw new Error("`value` precisa ser o LaTeX candidato.");
  if (value.length > 200_000) throw new Error("`value` é grande demais para uma questão.");

  return { field: field as keyof QuestionForRender, value };
}
