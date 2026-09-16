import {
  segmentarPagina,
  type PaginaDeTexto,
  type QuestaoEstimada,
} from "@modules/recognition/domain/segmentar-pagina";

import type { CaptureProfile, DraftItem } from "../capture-profile";
import type { PageModel } from "../page";
import type { ProposedRegion } from "../proposal";
import { semanticPrompt } from "./semantic-prompt";

/**
 * `exam-v1` — a prova de concurso de sempre: `1.` ou `Questão 12` na margem, sequência crescente,
 * "Solução da questão N" dentro da caixa (D46).
 *
 * É a segmentação da captura (`segmentar-pagina.ts`) **sem mudança nenhuma**: o perfil chama a
 * mesma função, página por página, e os 30 de 30 do ENA continuam sendo o teste de regressão. O
 * que o perfil acrescenta é só o que o scan precisa e a captura não: a continuação na página
 * seguinte como segunda âncora do mesmo item.
 */

/**
 * A página do motor no formato da segmentação. Mesma conta do adaptador do navegador
 * (`pdf-text-layer.ts`): o topo do trecho é a linha de base menos o corpo.
 */
export function toPaginaDeTexto(page: PageModel): PaginaDeTexto {
  return {
    largura: page.width,
    altura: page.height,
    palavras: page.lines.flatMap((line) =>
      line.spans.map((span) => {
        const baseline = span.y1 - span.size * 0.22;
        return {
          texto: span.text,
          x: span.x0,
          y: baseline - span.size,
          largura: span.x1 - span.x0,
          altura: span.size,
        };
      }),
    ),
  };
}

function region(pageNumber: number, estimate: QuestaoEstimada, role: ProposedRegion["role"]): ProposedRegion {
  return { pageNumber, box: estimate.box, role };
}

function buildItems(pages: readonly PageModel[]): DraftItem[] {
  const drafts: DraftItem[] = [];
  let pending: number | null = null;

  for (const page of pages) {
    const estimates = segmentarPagina(toPaginaDeTexto(page));

    // O que sobrou do alto desta página, antes da primeira questão, é a continuação da anterior.
    const first = estimates[0];
    const previous = pending !== null ? drafts[pending] : undefined;
    if (pending !== null && previous && first && first.box.y > 0.12) {
      const top = Math.min(...page.lines.map((line) => line.y0)) / page.height;
      const height = first.box.y - top;
      if (height > 0.01) {
        drafts[pending] = {
          ...previous,
          regions: [
            ...previous.regions,
            {
              pageNumber: page.pageNumber,
              box: { x: first.box.x, y: top, width: first.box.width, height },
              role: "CONTINUATION",
            },
          ],
          evidence: [...previous.evidence, "continua no alto da página seguinte"],
        };
      }
    }
    pending = null;

    for (const [index, estimate] of estimates.entries()) {
      const words = toPaginaDeTexto(page).palavras.filter(
        (word) =>
          word.y / page.height >= estimate.box.y &&
          (word.y + word.altura) / page.height <= estimate.box.y + estimate.box.height,
      );
      const text = words.map((word) => word.texto).join(" ");
      drafts.push({
        key: `QUESTION:${page.pageNumber}:${index}`,
        parentKey: null,
        kind: "QUESTION",
        originalLabel: estimate.numero !== null ? String(estimate.numero) : null,
        number: estimate.numero !== null ? String(estimate.numero) : null,
        title: null,
        pageNumber: page.pageNumber,
        printedPage: null,
        regions: [region(page.pageNumber, estimate, "PRIMARY")],
        text,
        latex: null,
        needsMath: true,
        confidence: 0,
        confidenceParts: {
          pattern: estimate.numero !== null ? 0.9 : 0.5,
          layout: estimate.razao === "sobra-final" ? 0.6 : 0.9,
        },
        evidence: [
          estimate.razao === "enunciado-ate-solucao"
            ? "enunciado até o fim da solução"
            : estimate.razao === "enunciado-ate-proximo"
              ? "enunciado até a próxima questão"
              : "última questão da página",
        ],
        metadata: {},
        lines: [],
      });
      if (estimate.continuaNaProxima) pending = drafts.length - 1;
    }
  }

  return drafts;
}

export const examV1: CaptureProfile = {
  id: "exam-v1",
  version: 1,
  label: "Prova de concurso",
  documentKind: "EXAM",
  description:
    "Provas com questões numeradas na margem (1., Questão 12), uma coluna, solução logo abaixo. É a estimativa da captura, em lote.",
  kinds: ["QUESTION"],
  settings: {
    answersLocation: "BELOW",
    columns: 1,
    defaultQuestionType: "MULTIPLE_CHOICE",
    visionModel: null,
    emitContent: false,
    autoAcceptThreshold: 0.85,
  },
  markers: {
    questionStart: [/^(\d{1,3})\.(?!\d)/, /^quest[ãa]o\s*(?:n[ºo°]?\.?\s*)?(\d{1,3})(?!\d)/i],
    solution: [/^solu[çc][ãa]o\s+d[ae]\s+quest[ãa]o\s*(\d{1,3})(?!\d)/i],
    headings: [],
    exerciseBlock: [],
  },

  classifyLine: () => null,
  canContain: (parent, child) => parent === null && child === "QUESTION",
  buildItems,

  buildSemanticPrompt: (input) =>
    semanticPrompt(input, "O documento é uma prova de concurso com questões numeradas na margem."),
};
