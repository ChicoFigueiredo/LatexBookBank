import { isExclusiveCorrect } from "@modules/questions/domain/option-mutations";
import { isQuestionType, optionLabelAt } from "@modules/questions/domain/question-type";

import type { PatchableQuestionField, QuestionPatch } from "./question-patch";

/**
 * O diff que a tela mostra — **antes de qualquer coisa ser aplicada**.
 *
 * Calculado no domínio, e não na tela, por dois motivos: a decisão de o que conta como mudança é
 * do dado (um patch que reescreve o campo com o mesmo texto não é mudança), e a mesma conta
 * precisa rodar no servidor, quando a aplicação seletiva conferir se o que o usuário aprovou
 * ainda é o que está lá.
 *
 * Ver spec §35 · issue #99.
 */

export interface QuestionState {
  /**
   * O tipo decide o gabarito: num tipo exclusivo, marcar uma correta desmarca as outras; numa
   * MULTIPLE_CORRECT, não. Sem ele o aplicador decidia sozinho — e decidia sempre "exclusivo".
   */
  readonly type: string;
  readonly statementLatex: string;
  readonly solutionLatex: string;
  readonly complementLatex: string;
  readonly nickname: string | null;
  readonly options: readonly {
    readonly id: string;
    /** A posição (D9). Vai para o snapshot: restaurar a revisão devolve a mesma ordem. */
    readonly sortKey: string;
    readonly statementLatex: string;
    readonly isCorrect: boolean;
  }[];
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly tags: readonly string[];
}

/**
 * Se o tipo admite uma correta só.
 *
 * Tipo fora do vocabulário — o legado traz alguns — fica com a leitura conservadora: uma correta,
 * que é o que o aplicador sempre assumiu.
 */
export const exclusiveCorrectFor = (type: string): boolean =>
  isQuestionType(type) ? isExclusiveCorrect(type) : true;

/**
 * Uma impressão curta do valor de antes, que entra no id da mudança.
 *
 * É o que faz a aprovação valer sobre o estado que foi **mostrado**: se o autosave gravou uma
 * vírgula entre a proposta e o clique, o id que a tela aprovou deixa de existir no diff recalculado,
 * e a linha volta como obsoleta em vez de sobrescrever a edição. FNV-1a de 32 bits: o domínio não
 * tem `crypto`, e aqui não há segredo a proteger — só igualdade a conferir.
 */
export function fingerprint(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export type ChangeKind = "field" | "option" | "reorder" | "metadata" | "tags";

export interface Change {
  /** Estável: é por ele que o usuário aprova ou descarta uma linha do diff. */
  readonly id: string;
  readonly kind: ChangeKind;
  /** O que aparece no cabeçalho da linha. */
  readonly label: string;
  readonly before: string;
  readonly after: string;
  /**
   * `true` quando o valor é LaTeX e merece diff do Monaco.
   *
   * Um `board` que muda de "CESPE" para "CEBRASPE" numa caixa de diff de código é ruído; um
   * enunciado de dez linhas numa linha de texto corrido é ilegível. São formatos diferentes
   * porque são conteúdos diferentes.
   */
  readonly latex: boolean;
}

const NO_VALUE = "(vazio)";

/**
 * As mudanças reais do patch contra o estado atual.
 *
 * Reescrita idêntica **não** vira mudança: o agente devolve o campo inteiro mesmo quando mexeu em
 * uma vírgula, e mostrar "statementLatex mudou" quando nada mudou treina quem revisa a aprovar
 * sem olhar — que é exatamente o que a aprovação explícita existe para impedir.
 */
export function diffPatch(state: QuestionState, patch: QuestionPatch): readonly Change[] {
  const changes: Change[] = [];

  for (const entry of patch.fields) {
    // `noUncheckedIndexedAccess` está ligado, mas `field` vem do enum da whitelist — o acesso é
    // sempre a uma das três chaves de texto, e `nickname` tem tratamento próprio por ser anulável.
    const before =
      entry.field === "nickname" ? (state.nickname ?? "") : (state[entry.field] as string);
    if (before === entry.value) continue;

    changes.push({
      id: `field:${entry.field}:${fingerprint(before)}`,
      kind: "field",
      label: FIELD_LABELS[entry.field],
      before: before || NO_VALUE,
      after: entry.value || NO_VALUE,
      latex: entry.field !== "nickname",
    });
  }

  const byId = new Map(state.options.map((option, index) => [option.id, { option, index }]));
  const exclusive = exclusiveCorrectFor(state.type);
  // O gabarito de agora entra no id da linha de gabarito: se alguém o mudou depois da proposta, a
  // aprovação deixa de valer.
  const answerKey = fingerprint(
    state.options
      .filter((option) => option.isCorrect)
      .map((option) => option.id)
      .join(","),
  );

  for (const entry of patch.options) {
    const found = byId.get(entry.optionId);
    // Alternativa que não existe mais: o agente propôs sobre um estado que mudou. Some do diff em
    // vez de virar uma linha que ninguém consegue aprovar.
    if (!found) continue;

    const { option, index } = found;
    // A letra vem da posição atual, e é só rótulo — o endereço é o id (D9/§8.5).
    const letter = optionLabelAt(index);
    const label = `Alternativa ${letter})`;

    if (entry.statementLatex !== undefined && entry.statementLatex !== option.statementLatex) {
      changes.push({
        id: `option:${option.id}:text:${fingerprint(option.statementLatex)}`,
        kind: "option",
        label,
        before: option.statementLatex || NO_VALUE,
        after: entry.statementLatex || NO_VALUE,
        latex: true,
      });
    }

    if (entry.isCorrect !== undefined && entry.isCorrect !== option.isCorrect) {
      // Num tipo exclusivo, marcar esta desmarca as outras — e quem aprova precisa ver isso na
      // própria linha, não descobrir depois que a correta antiga sumiu.
      const unmarked =
        exclusive && entry.isCorrect
          ? state.options.flatMap((other, position) =>
              other.isCorrect && other.id !== option.id ? [`${optionLabelAt(position)})`] : [],
            )
          : [];

      changes.push({
        id: `option:${option.id}:correct:${answerKey}`,
        kind: "option",
        label: `${label} — gabarito`,
        before:
          unmarked.length > 0
            ? `incorreta (a correta hoje é ${unmarked.join(", ")})`
            : option.isCorrect
              ? "correta"
              : "incorreta",
        after:
          unmarked.length > 0
            ? `correta (${unmarked.join(", ")} deixa de ser)`
            : entry.isCorrect
              ? "correta"
              : "incorreta",
        latex: false,
      });
    }
  }

  if (patch.reorder) {
    const current = state.options.map((option) => option.id);
    const proposed = patch.reorder.optionIds;

    // Só uma **permutação** das alternativas atuais é uma nova ordem. Uma lista parcial, ou com id
    // que não existe mais, reescreveria as chaves só de parte delas — e as outras empatariam com
    // as novas, deixando a letra (e o gabarito) ao sabor do `ORDER BY` (D9).
    const permutation = proposed.length === current.length && proposed.every((id) => byId.has(id));

    if (permutation && current.some((id, i) => id !== proposed[i])) {
      changes.push({
        id: `reorder:${fingerprint(current.join(","))}`,
        kind: "reorder",
        label: "Ordem das alternativas",
        // Por trecho e não por id: uma lista de uuid não diz nada a quem revisa.
        before: current.map((id) => excerptOfOption(state, id)).join(" · "),
        after: proposed.map((id) => excerptOfOption(state, id)).join(" · "),
        latex: false,
      });
    }
  }

  if (patch.metadata) {
    for (const [key, value] of Object.entries(patch.metadata)) {
      const before = state.metadata[key] ?? null;
      if (String(before ?? "") === String(value ?? "")) continue;

      changes.push({
        id: `metadata:${key}:${fingerprint(String(before ?? ""))}`,
        kind: "metadata",
        label: METADATA_LABELS[key] ?? key,
        before: before === null || before === "" ? NO_VALUE : String(before),
        after: value === null || value === "" ? NO_VALUE : String(value),
        latex: false,
      });
    }
  }

  if (patch.tags) {
    // Conjunto, não lista: tag não tem ordem, e mostrar "mudou" porque a ordem veio diferente
    // seria uma mudança inventada.
    const before = [...state.tags].sort();
    const after = [...patch.tags.names].sort();

    if (before.join("\u0000") !== after.join("\u0000")) {
      changes.push({
        id: `tags:${fingerprint(before.join("\u0000"))}`,
        kind: "tags",
        label: "Tags",
        before: before.length > 0 ? before.join(", ") : NO_VALUE,
        after: after.length > 0 ? after.join(", ") : NO_VALUE,
        latex: false,
      });
    }
  }

  return changes;
}

const EXCERPT = 40;

function excerptOfOption(state: QuestionState, id: string): string {
  const option = state.options.find((candidate) => candidate.id === id);
  if (!option) return "(alternativa removida)";

  const flat = option.statementLatex.replace(/\s+/g, " ").trim();
  return flat.length <= EXCERPT ? flat || "(vazia)" : `${flat.slice(0, EXCERPT)}…`;
}

const FIELD_LABELS: Readonly<Record<PatchableQuestionField, string>> = {
  statementLatex: "Enunciado",
  solutionLatex: "Resolução",
  complementLatex: "Complemento",
  nickname: "Apelido",
};

const METADATA_LABELS: Readonly<Record<string, string>> = {
  difficulty: "Dificuldade",
  year: "Ano",
  board: "Banca",
  institution: "Instituição",
  role: "Cargo",
  roleLevel: "Nível do cargo",
  publisher: "Origem",
  videoUrl: "Vídeo",
};
