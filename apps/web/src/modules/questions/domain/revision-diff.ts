import { optionLabelAt } from "./question-type";

/**
 * O diff entre duas revisões.
 *
 * Reaproveita a **forma** do diff de patch, mas não o código: aquele compara um estado com uma
 * proposta e precisa saber o que o patch quis dizer; este compara dois estados completos e não
 * tem proposta nenhuma. Fundir os dois exigiria um "modo" dentro da função de diff, e é assim que
 * uma função de comparação vira um lugar onde ninguém mais entende qual metade está rodando.
 *
 * Ver spec §37 · issue #109.
 */

export interface RevisionSnapshot {
  readonly statementLatex: string;
  readonly solutionLatex: string;
  readonly complementLatex: string;
  readonly nickname: string | null;
  readonly options: readonly {
    readonly id: string;
    readonly statementLatex: string;
    readonly isCorrect: boolean;
  }[];
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly tags: readonly string[];
}

export interface RevisionChange {
  readonly id: string;
  readonly label: string;
  readonly before: string;
  readonly after: string;
  readonly latex: boolean;
}

const NO_VALUE = "(vazio)";

const TEXT_FIELDS = [
  ["statementLatex", "Enunciado", true],
  ["solutionLatex", "Resolução", true],
  ["complementLatex", "Complemento", true],
  ["nickname", "Apelido", false],
] as const;

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

/**
 * O que mudou entre `before` e `after`.
 *
 * A ordem dos argumentos é a cronológica — a revisão mais antiga primeiro —, e não a de "atual
 * contra guardada". Inverter isso faria a coluna "depois" mostrar o passado, que é o tipo de
 * inversão que ninguém nota até restaurar a versão errada.
 */
export function diffSnapshots(
  before: RevisionSnapshot,
  after: RevisionSnapshot,
): readonly RevisionChange[] {
  const changes: RevisionChange[] = [];

  for (const [field, label, latex] of TEXT_FIELDS) {
    const from = before[field] ?? "";
    const to = after[field] ?? "";
    if (from === to) continue;

    changes.push({
      id: `field:${field}`,
      label,
      before: from || NO_VALUE,
      after: to || NO_VALUE,
      latex,
    });
  }

  const beforeOptions = new Map(before.options.map((option) => [option.id, option]));
  const afterOptions = new Map(after.options.map((option) => [option.id, option]));

  for (const [index, option] of after.options.entries()) {
    const previous = beforeOptions.get(option.id);
    // A letra vem da posição **atual**: é rótulo, não endereço (D9/§8.5).
    const label = `Alternativa ${optionLabelAt(index)})`;

    if (!previous) {
      changes.push({
        id: `option:${option.id}:added`,
        label,
        before: "(não existia)",
        after: option.statementLatex || NO_VALUE,
        latex: true,
      });
      continue;
    }

    if (previous.statementLatex !== option.statementLatex) {
      changes.push({
        id: `option:${option.id}:text`,
        label,
        before: previous.statementLatex || NO_VALUE,
        after: option.statementLatex || NO_VALUE,
        latex: true,
      });
    }
    if (previous.isCorrect !== option.isCorrect) {
      changes.push({
        id: `option:${option.id}:correct`,
        label: `${label} — gabarito`,
        before: previous.isCorrect ? "correta" : "incorreta",
        after: option.isCorrect ? "correta" : "incorreta",
        latex: false,
      });
    }
  }

  for (const [index, option] of before.options.entries()) {
    if (afterOptions.has(option.id)) continue;

    // Alternativa removida aparece com o rótulo que ela **tinha**: dizer "alternativa c)" sobre
    // uma lista onde não há mais uma c) confunde mais que ajuda.
    changes.push({
      id: `option:${option.id}:removed`,
      label: `Alternativa ${optionLabelAt(index)}) — removida`,
      before: option.statementLatex || NO_VALUE,
      after: "(removida)",
      latex: true,
    });
  }

  const keys = new Set([...Object.keys(before.metadata), ...Object.keys(after.metadata)]);
  for (const key of [...keys].sort()) {
    const from = before.metadata[key] ?? null;
    const to = after.metadata[key] ?? null;
    if (String(from ?? "") === String(to ?? "")) continue;

    changes.push({
      id: `metadata:${key}`,
      label: METADATA_LABELS[key] ?? key,
      before: from === null || from === "" ? NO_VALUE : String(from),
      after: to === null || to === "" ? NO_VALUE : String(to),
      latex: false,
    });
  }

  // Conjunto e não lista: tag não tem ordem, e ordem diferente não é mudança.
  const tagsBefore = [...before.tags].sort();
  const tagsAfter = [...after.tags].sort();
  if (tagsBefore.join(" ") !== tagsAfter.join(" ")) {
    changes.push({
      id: "tags",
      label: "Tags",
      before: tagsBefore.length > 0 ? tagsBefore.join(", ") : NO_VALUE,
      after: tagsAfter.length > 0 ? tagsAfter.join(", ") : NO_VALUE,
      latex: false,
    });
  }

  return changes;
}

/** Lê um `snapshotJson` com defaults — revisão antiga pode não ter um campo que existe hoje. */
export function parseSnapshot(json: string): RevisionSnapshot {
  const raw = JSON.parse(json) as Partial<RevisionSnapshot>;

  return {
    statementLatex: raw.statementLatex ?? "",
    solutionLatex: raw.solutionLatex ?? "",
    complementLatex: raw.complementLatex ?? "",
    nickname: raw.nickname ?? null,
    options: raw.options ?? [],
    metadata: raw.metadata ?? {},
    tags: raw.tags ?? [],
  };
}
