import { segmentarPagina, type QuestaoEstimada } from "@modules/recognition/domain/segmentar-pagina";

import type { CaptureProfile, DraftItem } from "../capture-profile";
import { toPaginaDeTexto, type PageModel } from "../page";
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

/**
 * A partir de que fração da página uma linha de texto é "larga", isto é, de uma coluna só.
 *
 * Em duas colunas nenhuma linha de corpo passa de perto da metade; numa coluna, a maioria passa
 * de 55%. É a medida mais barata que separa os dois, e não exige medir coluna de verdade.
 */
const COLUMN_WIDTH = 0.55;

/**
 * A partir de que proporção de linhas largas o documento já conta como de uma coluna só.
 *
 * Medido: a prova do ENA tem 44% — o resto são alternativas curtas, fórmulas e caixas de
 * solução — e o caderno do ENEM tem perto de zero. O patamar reconhece a primeira sem exigir
 * dela uma página de prosa corrida, que prova nenhuma tem.
 */
const ONE_COLUMN_SHARE = 0.35;

/** Os dois marcadores de margem que a prova de concurso usa — só para a nota; quem segmenta é a captura. */
const MARGIN_QUESTION = /^(?:(\d{1,3})\.(?!\d)|quest[\u00e3a]o\s*(?:n[\u00ba\u00b0]?\.?\s*)?(\d{1,3})(?!\d))/i;

export const examV1: CaptureProfile = {
  id: "exam-v1",
  version: 1,
  label: "Prova de concurso",
  documentKind: "EXAM",
  description:
    "Provas com questões numeradas na margem (1., Questão 12), uma coluna, solução logo abaixo. É a estimativa da captura, em lote.",
  kinds: ["QUESTION"],
  settings: {
    defaultQuestionType: "MULTIPLE_CHOICE",
    emitContent: false,
    autoAcceptThreshold: 0.85,
  },

  /*
    A prova de concurso é a mais difícil de reconhecer de longe: "1." e "Questão 12" na margem
    são o mesmo marcador que um livro usa numa lista de exercícios. O que a separa é a
    **sequência** — 1, 2, 3 crescendo página afora — e a ausência de título de capítulo no meio.
    Por isso a nota olha o passo da numeração, e não só quantos marcadores existem.
  */
  score(sample) {
    const paginas = Math.max(1, sample.length);
    const numeros: number[] = [];
    let largas = 0;
    let total = 0;
    for (const page of sample) {
      for (const line of page.lines) {
        const match = MARGIN_QUESTION.exec(line.text.trim());
        const n = match ? Number.parseInt(match[1] ?? match[2] ?? "", 10) : Number.NaN;
        if (Number.isFinite(n)) numeros.push(n);
        if (line.text.trim().length > 20) {
          total++;
          if (line.x1 - line.x0 > page.width * COLUMN_WIDTH) largas++;
        }
      }
    }

    // Quantos marcadores continuam de onde o anterior parou: é o que separa prova de lista solta.
    let emSequencia = 0;
    let reinicios = 0;
    for (let i = 1; i < numeros.length; i++) {
      if (numeros[i]! === numeros[i - 1]! + 1) emSequencia++;
      else if (numeros[i]! <= numeros[i - 1]!) reinicios++;
    }

    /*
      Numeração que reinicia não é prova — é lista de exercícios.

      Medido no *Fundamentos*: os blocos de exercícios recomeçam do 1 a cada seção, e sem esta
      conta o livro pontuava 0,82 como prova de concurso. Uma prova numera de 1 a N uma vez só,
      e por isso nem a amostra espalhada a faz voltar atrás: entre duas páginas distantes o
      número pula para a frente, nunca para trás.
    */
    const continua = emSequencia + reinicios === 0 ? 0 : emSequencia / (emSequencia + reinicios);

    /*
      Uma coluna é metade da identidade deste perfil, e sem ela o corpus real acusou empate.

      "QUESTÃO 45" também casa com o marcador daqui, e num caderno do ENEM a numeração também
      cresce — os dois perfis chegavam a 1,00 e quem ganhava era a ordem de registro. O que o ENEM
      não tem é linha larga: em duas colunas, texto nenhum atravessa a página.
    */
    const umaColuna = total === 0 ? 0 : Math.min(1, largas / total / ONE_COLUMN_SHARE);

    return {
      score: Math.min(1, (emSequencia / (paginas * 3)) * 0.9 * umaColuna * continua),
      evidence: `${numeros.length} marcadores na margem, ${emSequencia} em sequência e ${reinicios} recomeços, ${Math.round(umaColuna * 100)}% do texto em linha larga`,
    };
  },

  classifyLine: () => null,
  canContain: (parent, child) => parent === null && child === "QUESTION",
  buildItems,

  buildSemanticPrompt: (input) =>
    semanticPrompt(input, "O documento é uma prova de concurso com questões numeradas na margem."),
};
