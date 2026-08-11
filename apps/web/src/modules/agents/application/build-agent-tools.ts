import { optionLabelAt } from "@modules/questions/domain/question-type";
import { evaluateQuestion } from "@modules/questions/application/validate-question";

import {
  optionalInteger,
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
 * do que lendo prosa rotulada.
 *
 * ## O id da questão **não** é parâmetro
 *
 * As seis tools de questão operam sobre a questão aberta na tela, e o id vem do servidor. A
 * primeira versão aceitava `questionId` no input, e uma verificação contra o Ollama real mostrou
 * o problema: o modelo inventava uuid — três ids diferentes numa só conversa — recebia "não
 * encontrei" e concluía que a questão não tinha alternativas. A resposta soava plausível.
 *
 * Dizer o id no prompt de sistema não resolveu; o modelo continuou inventando. O que resolve é
 * não perguntar: `get_current_question` quer dizer **a atual**, e id que o modelo não fornece é
 * id que o modelo não pode errar. Descoberta de outras questões continua existindo, por
 * `search_questions` — que é onde ela deve estar.
 *
 * Ver spec §35 · issue #95 · #97.
 */

const NO_FOCUS = "Nenhuma questão está aberta na tela. Peça ao usuário para abrir uma.";

/** Sem parâmetro nenhum: a tool age sobre a questão em foco. */
const NO_INPUT_SCHEMA = { type: "object", properties: {}, additionalProperties: false } as const;

export interface AgentToolScope {
  /** A questão aberta, ou `null`. Vem do servidor, nunca do modelo. */
  readonly questionId: string | null;
}

export function buildAgentTools(port: AgentReadPort, scope: AgentToolScope): readonly AgentTool[] {
  const focused = scope.questionId;
  const tools: AgentTool[] = [
    {
      name: "get_current_question",
      description:
        "Enunciado, resolução, complemento, tipo e situação de validação da questão aberta.",
      inputSchema: { ...NO_INPUT_SCHEMA },
      execute: async () => {
        if (focused === null) return NO_FOCUS;
        const question = await port.getQuestion(focused);
        if (!question) return NO_FOCUS;

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
      description: "Alternativas da questão aberta, na ordem, com a indicação de qual é correta.",
      inputSchema: { ...NO_INPUT_SCHEMA },
      execute: async () => {
        if (focused === null) return NO_FOCUS;
        const options = await port.getOptions(focused);
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
      description: "De onde a questão aberta veio: banca, ano, instituição, cargo, dificuldade.",
      inputSchema: { ...NO_INPUT_SCHEMA },
      execute: async () => {
        if (focused === null) return NO_FOCUS;
        const metadata = await port.getMetadata(focused);
        if (!metadata) return NO_FOCUS;

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
        "Onde a questão aberta estava no material de origem: página, recorte e texto extraído.",
      inputSchema: { ...NO_INPUT_SCHEMA },
      execute: async () => {
        if (focused === null) return NO_FOCUS;
        const anchor = await port.getSourceAnchor(focused);
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
        "Diagnósticos da última compilação LaTeX da questão aberta: erros, avisos e onde ocorreram.",
      inputSchema: { ...NO_INPUT_SCHEMA },
      execute: async () => {
        if (focused === null) return NO_FOCUS;
        const render = await port.getLatestRender(focused);
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
        "Roda a validação da questão aberta pelo plugin do tipo dela e lista erros e avisos.",
      inputSchema: { ...NO_INPUT_SCHEMA },
      execute: async () => {
        if (focused === null) return NO_FOCUS;
        const question = await port.getQuestion(focused);
        if (!question) return NO_FOCUS;

        const options = await port.getOptions(focused);

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
