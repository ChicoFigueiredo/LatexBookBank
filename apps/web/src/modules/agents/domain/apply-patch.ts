import { diffPatch, exclusiveCorrectFor, type Change, type QuestionState } from "./patch-diff";
import { PatchRejectedError, type QuestionPatch } from "./question-patch";

/**
 * O que aplicar, dado o que o usuário **aprovou**.
 *
 * A regra que este arquivo torna verdadeira: nada é aplicado sem aprovação explícita. Até a Fase 8
 * isso valia por ausência — não havia caminho de escrita nenhum. A partir daqui existe um, e ele
 * exige a lista de mudanças aprovadas. Aplicar o patch inteiro porque ele chegou é o mesmo que
 * não ter aprovação: o gesto de aprovar precisa selecionar, não confirmar.
 *
 * O cálculo é **puro** e roda outra vez no servidor. A tela mostra o diff, o usuário marca linhas,
 * e o servidor recalcula do zero antes de gravar — se o estado mudou nesse meio-tempo, as linhas
 * aprovadas deixam de existir e não há o que aplicar.
 *
 * Ver spec §35 · issue #101.
 */

export interface ApplyPlan {
  /** Só o que foi aprovado **e** ainda é mudança real. */
  readonly changes: readonly Change[];
  /** Os campos de texto a gravar. Só os aprovados aparecem. */
  readonly fields: Readonly<Record<string, string | null>>;
  /**
   * Por id de alternativa, com o gabarito **inteiro** que muda: num tipo exclusivo, a correta
   * antiga vem aqui desmarcada. Quem grava não decide regra de tipo nenhuma.
   */
  readonly options: readonly {
    readonly id: string;
    readonly statementLatex?: string;
    readonly isCorrect?: boolean;
  }[];
  /** Nova ordem, quando aprovada. */
  readonly reorder: readonly string[] | null;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly tags: readonly string[] | null;
  /**
   * Linhas que o usuário aprovou mas que sumiram do diff.
   *
   * Não é detalhe: significa que o estado mudou entre a proposta e a aprovação — outra aba, o
   * autosave, o próprio usuário. Aplicar assim mesmo gravaria por cima de trabalho que ninguém
   * pediu para desfazer, e quem chama precisa poder dizer isso em vez de gravar em silêncio.
   */
  readonly stale: readonly string[];
}

export class NothingApprovedError extends Error {
  constructor() {
    super("Nenhuma mudança foi aprovada — não há o que aplicar.");
    this.name = "NothingApprovedError";
  }
}

/**
 * Recusa duas corretas num tipo que admite uma só.
 *
 * Duas corretas numa múltipla escolha é o erro que a spec §8.5 mais teme, e o agente o comete com
 * frequência ao "corrigir" o gabarito. Conferido contra o tipo **do banco**, e não no schema: o
 * schema não sabe o tipo, e recusar duas corretas sempre impedia a MULTIPLE_CORRECT de receber o
 * gabarito dela. Roda na proposta (a mensagem volta para o modelo) e de novo ao aplicar.
 */
export function checkAnswerKeyForType(patch: QuestionPatch, type: string): void {
  const marked = patch.options.filter((entry) => entry.isCorrect === true).length;
  if (marked <= 1 || !exclusiveCorrectFor(type)) return;

  const message =
    `Uma questão ${type} admite uma correta só, e o patch marca ${marked}. ` +
    "Marque apenas a alternativa correta.";
  throw new PatchRejectedError(`O patch foi recusado. ${message}`, [message]);
}

/**
 * Monta o plano a partir do estado atual, do patch e dos ids aprovados.
 *
 * `approved` é obrigatório e não tem default. Um default — "tudo", ou "nada" — seria a decisão
 * mais importante do fluxo escondida num parâmetro opcional.
 */
export function planApply(
  state: QuestionState,
  patch: QuestionPatch,
  approved: readonly string[],
): ApplyPlan {
  checkAnswerKeyForType(patch, state.type);
  const exclusive = exclusiveCorrectFor(state.type);

  const live = diffPatch(state, patch);
  const liveIds = new Set(live.map((change) => change.id));

  const approvedSet = new Set(approved);
  const changes = live.filter((change) => approvedSet.has(change.id));
  const stale = approved.filter((id) => !liveIds.has(id));

  if (changes.length === 0) throw new NothingApprovedError();

  const fields: Record<string, string | null> = {};
  const options = new Map<string, { id: string; statementLatex?: string; isCorrect?: boolean }>();
  const metadata: Record<string, unknown> = {};
  let reorder: readonly string[] | null = null;
  let tags: readonly string[] | null = null;

  for (const change of changes) {
    // O id é `tipo:alvo[:detalhe]:impressão` — a impressão só serve para conferir o estado.
    const [, target, what] = change.id.split(":");

    switch (change.kind) {
      case "field": {
        const entry = patch.fields.find((candidate) => candidate.field === target);
        if (entry) {
          // `nickname` vazio vira `null`: a coluna é anulável, e `""` seria um apelido em branco
          // em vez de nenhum apelido.
          fields[entry.field] =
            entry.field === "nickname" && entry.value.trim() === "" ? null : entry.value;
        }
        break;
      }

      case "option": {
        const entry = patch.options.find((candidate) => candidate.optionId === target);
        if (!entry || target === undefined) break;

        // Texto e gabarito são duas aprovações distintas na tela; aprovar uma não arrasta a
        // outra, e por isso a mesma alternativa pode chegar aqui em dois passos.
        const current = options.get(target) ?? { id: target };
        if (what === "text" && entry.statementLatex !== undefined) {
          current.statementLatex = entry.statementLatex;
        }
        if (what === "correct" && entry.isCorrect !== undefined) {
          current.isCorrect = entry.isCorrect;

          // A regra do tipo, aplicada aqui e mostrada na mesma linha do diff: num tipo
          // exclusivo, a correta antiga deixa de ser. Numa MULTIPLE_CORRECT, nada mais muda.
          if (exclusive && entry.isCorrect) {
            for (const other of state.options) {
              if (other.isCorrect && other.id !== target) {
                options.set(other.id, { ...options.get(other.id), id: other.id, isCorrect: false });
              }
            }
          }
        }
        options.set(target, current);
        break;
      }

      case "reorder":
        if (patch.reorder) reorder = patch.reorder.optionIds;
        break;

      case "metadata": {
        if (target !== undefined && patch.metadata && target in patch.metadata) {
          metadata[target] = (patch.metadata as Record<string, unknown>)[target];
        }
        break;
      }

      case "tags":
        if (patch.tags) tags = patch.tags.names;
        break;
    }
  }

  return { changes, fields, options: [...options.values()], reorder, metadata, tags, stale };
}

/**
 * O snapshot que vira `Revision`.
 *
 * O estado **inteiro**, e não só os campos tocados: uma revisão parcial não permite restaurar,
 * que é a única coisa que ela existe para permitir. Restaurar a partir de um "antes" incompleto
 * devolveria uma questão que nunca existiu.
 */
export function snapshotOf(state: QuestionState): string {
  return JSON.stringify({
    snapshotVersion: SNAPSHOT_VERSION,
    type: state.type,
    statementLatex: state.statementLatex,
    solutionLatex: state.solutionLatex,
    complementLatex: state.complementLatex,
    nickname: state.nickname,
    options: state.options.map((option) => ({
      id: option.id,
      sortKey: option.sortKey,
      statementLatex: option.statementLatex,
      isCorrect: option.isCorrect,
    })),
    metadata: state.metadata,
    tags: [...state.tags],
  });
}

/**
 * A versão 2 acrescenta o tipo e a posição de cada alternativa: sem eles, restaurar devolvia uma
 * questão com o tipo trocado depois, e a ordem só por aproximação. Revisão antiga não tem os dois
 * campos, e a restauração dela faz o que dá — ver `revertQuestion`.
 */
export const SNAPSHOT_VERSION = 2;

/** O snapshot lido de volta: as revisões gravadas antes da versão 2 não têm tipo nem posição. */
export interface QuestionSnapshot extends Omit<QuestionState, "type" | "options"> {
  readonly snapshotVersion?: number;
  readonly type?: string;
  readonly options: readonly {
    readonly id: string;
    readonly sortKey?: string;
    readonly statementLatex: string;
    readonly isCorrect: boolean;
  }[];
}

/** Uma frase para a timeline, antes de abrir diff nenhum. */
export function describeChanges(changes: readonly Change[]): string {
  if (changes.length === 0) return "nada";
  if (changes.length === 1) return changes[0]?.label ?? "uma mudança";

  const labels = [...new Set(changes.map((change) => change.label))];
  return labels.length <= 3
    ? labels.join(", ")
    : `${labels.slice(0, 3).join(", ")} e mais ${labels.length - 3}`;
}
