import { optionLabelAt } from "@modules/questions/domain/question-type";
import { evaluateQuestion } from "@modules/questions/application/validate-question";

import {
  optionalInteger,
  requireId,
  requireText,
  truncateOutput,
  type AgentTool,
} from "../domain/tool-contract";
import type { AgentReadPort } from "./agent-read-port";

/**
 * As sete tools, construídas pelo **servidor** sobre a porta de leitura.
 *
 * O modelo escolhe qual chamar; a lista de quais existem não passa por ele em momento nenhum.
 * Cada tool valida o input antes de tocar a porta e trunca a saída no teto.
 *
 * A saída é **texto**, não JSON. Não é preguiça: JSON obriga o modelo a gastar atenção com
 * chaves e aspas, e modelos locais — que são o alvo primário (D21) — erram mais lendo estrutura
 * do que lendo prosa rotulada. O que precisa ser exato, como o id, vai rotulado em linha própria.
 *
 * Ver spec §35 · issue #95.
 */

const NOT_FOUND = (what: string) =>
  `Não encontrei ${what}. Confira o id — ele vem do contexto anexado, não de memória.`;

const ID_SCHEMA = {
  type: "object",
  properties: { questionId: { type: "string", description: "Id da questão." } },
  required: ["questionId"],
  additionalProperties: false,
} as const;

export function buildAgentTools(port: AgentReadPort): readonly AgentTool[] {
  const tools: AgentTool[] = [
    {
      name: "get_current_question",
      description:
        "Enunciado, resolução, complemento, tipo e situação de validação de uma questão.",
      inputSchema: { ...ID_SCHEMA },
      execute: async (input) => {
        const id = requireId("get_current_question", input, "questionId");
        const question = await port.getQuestion(id);
        if (!question) return NOT_FOUND(`a questão \`${id}\``);

        return truncateOutput(
          [
            `Id: ${question.id}`,
            `Tipo: ${question.type}`,
            `Apelido: ${question.nickname ?? "—"}`,
            `Situação: ${question.status} · validação ${question.validationStatus}`,
            `Tags: ${question.tags.length > 0 ? question.tags.join(", ") : "—"}`,
            "",
            "## Enunciado",
            question.statementLatex || "(vazio)",
            "",
            "## Resolução",
            question.solutionLatex || "(vazia)",
            "",
            "## Complemento",
            question.complementLatex || "(vazio)",
          ].join("\n"),
        );
      },
    },

    {
      name: "get_question_options",
      description: "Alternativas de uma questão, na ordem, com a indicação de qual é correta.",
      inputSchema: { ...ID_SCHEMA },
      execute: async (input) => {
        const id = requireId("get_question_options", input, "questionId");
        const options = await port.getOptions(id);
        if (options.length === 0) return "Esta questão não tem alternativas.";

        return truncateOutput(
          options
            .map((option, index) => {
              // A letra vem da **posição**, nunca do banco (D9/§8.5). Guardá-la na linha é o que
              // quebrava o gabarito ao embaralhar no legado.
              const mark = option.isCorrect ? " ✓ correta" : "";
              return `${optionLabelAt(index)})${mark}\n${option.statementLatex}`;
            })
            .join("\n\n"),
        );
      },
    },

    {
      name: "get_question_metadata",
      description: "De onde a questão veio: banca, ano, instituição, cargo, dificuldade.",
      inputSchema: { ...ID_SCHEMA },
      execute: async (input) => {
        const id = requireId("get_question_metadata", input, "questionId");
        const metadata = await port.getMetadata(id);
        if (!metadata) return NOT_FOUND(`metadados para a questão \`${id}\``);

        return truncateOutput(
          [
            `Dificuldade: ${metadata.difficultyLabel} (${metadata.difficulty})`,
            `Ano: ${metadata.year ?? "—"}`,
            `Banca: ${metadata.board ?? "—"}`,
            `Instituição: ${metadata.institution ?? "—"}`,
            `Cargo: ${metadata.role ?? "—"}${metadata.roleLevel ? ` · ${metadata.roleLevel}` : ""}`,
            `Origem: ${metadata.publisher ?? "—"}`,
            `Vídeo: ${metadata.videoUrl ?? "—"}`,
          ].join("\n"),
        );
      },
    },

    {
      name: "get_source_anchor",
      description:
        "Onde a questão estava no material de origem: página, recorte e texto extraído, se houver.",
      inputSchema: { ...ID_SCHEMA },
      execute: async (input) => {
        const id = requireId("get_source_anchor", input, "questionId");
        const anchor = await port.getSourceAnchor(id);
        // Ausência é resposta legítima, não erro: metade do acervo foi digitada, não recortada.
        if (!anchor) return "Esta questão não tem âncora de origem — não veio de recorte.";

        const { box } = anchor;
        return truncateOutput(
          [
            `Publicação: ${anchor.publicationId}`,
            `Página: ${anchor.pageNumber}`,
            `Recorte (normalizado): x=${box.x.toFixed(4)} y=${box.y.toFixed(4)} ` +
              `l=${box.width.toFixed(4)} a=${box.height.toFixed(4)}`,
            `Extração: ${anchor.extractionMethod ?? "—"}${anchor.extractionModel ? ` · ${anchor.extractionModel}` : ""}`,
            "",
            "## Texto extraído",
            anchor.sourceText ?? "(nenhum)",
          ].join("\n"),
        );
      },
    },

    {
      name: "get_render_diagnostics",
      description:
        "Diagnósticos da última compilação LaTeX da questão: erros, avisos e onde ocorreram.",
      inputSchema: { ...ID_SCHEMA },
      execute: async (input) => {
        const id = requireId("get_render_diagnostics", input, "questionId");
        const render = await port.getLatestRender(id);
        if (!render) return "Esta questão nunca foi compilada.";

        const head = `Job ${render.jobId} · ${render.state} · ${render.success ? "sucesso" : "falha"} · ${render.durationMs} ms`;

        if (render.diagnostics.length === 0) {
          return `${head}\n\nNenhum diagnóstico — a compilação passou limpa.`;
        }

        return truncateOutput(
          [
            head,
            "",
            ...render.diagnostics.map((diagnostic) => {
              const where =
                diagnostic.file !== undefined
                  ? ` (${diagnostic.file}${diagnostic.line !== undefined ? `:${diagnostic.line}` : ""})`
                  : "";
              return `[${diagnostic.severity}]${where} ${diagnostic.message}`;
            }),
          ].join("\n"),
        );
      },
    },

    {
      name: "search_questions",
      description: "Busca questões por texto do enunciado. Devolve id, tipo e um trecho.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Texto a procurar no enunciado." },
          limit: { type: "integer", description: "Quantos resultados (1 a 25). Padrão 10." },
        },
        required: ["query"],
        additionalProperties: false,
      },
      execute: async (input) => {
        const query = requireText("search_questions", input, "query");
        const limit = optionalInteger("search_questions", input, "limit", {
          min: 1,
          max: 25,
          fallback: 10,
        });

        const hits = await port.searchQuestions(query, limit);
        if (hits.length === 0) return `Nenhuma questão contém "${query}".`;

        return truncateOutput(
          hits
            .map((hit) => `- ${hit.id} · ${hit.type} · ${hit.title}\n  ${hit.excerpt}`)
            .join("\n"),
        );
      },
    },

    {
      name: "validate_question",
      description:
        "Roda a validação da questão pelo plugin do tipo dela e lista erros e avisos encontrados.",
      inputSchema: { ...ID_SCHEMA },
      execute: async (input) => {
        const id = requireId("validate_question", input, "questionId");
        const question = await port.getQuestion(id);
        if (!question) return NOT_FOUND(`a questão \`${id}\``);

        const options = await port.getOptions(id);

        // Avalia **sem persistir**: a tool é de leitura, e gravar `validationStatus` daqui seria
        // exatamente a escrita silenciosa que a lista fechada existe para impedir.
        const outcome = evaluateQuestion({
          type: question.type,
          statementLatex: question.statementLatex,
          solutionLatex: question.solutionLatex,
          complementLatex: question.complementLatex,
          options: options.map((option) => ({
            id: option.id,
            statementLatex: option.statementLatex,
            isCorrect: option.isCorrect,
          })),
        });

        if (outcome.unsupported) {
          // "Não sei avaliar" não é "está errada" — dizer o contrário seria mentira sobre o dado.
          return `O tipo \`${question.type}\` ainda não tem plugin de validação. A questão fica UNVALIDATED.`;
        }

        if (outcome.issues.length === 0) return `${outcome.status} — nenhum problema encontrado.`;

        return truncateOutput(
          [
            `${outcome.status} — ${outcome.issues.length} ${outcome.issues.length === 1 ? "problema" : "problemas"}:`,
            "",
            ...outcome.issues.map(
              (issue) =>
                `[${issue.severity}] ${issue.code}: ${issue.message}` +
                (issue.optionId ? ` (alternativa ${issue.optionId})` : ""),
            ),
          ].join("\n"),
        );
      },
    },
  ];

  return tools;
}
