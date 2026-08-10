/**
 * As quatro invariantes que o import **afirma** — e por causa das quais ele falha.
 *
 * Afirmar em vez de assumir é a decisão inteira deste arquivo. O levantamento mostrou gabarito
 * perfeito no acervo: 230 alternativas corretas para exatamente 230 questões de múltipla escolha,
 * nenhuma sem gabarito, nenhuma com duas. Um importador que **assumisse** isso passaria batido no
 * dia em que não fosse verdade — e o dia em que não for verdade é justamente aquele em que
 * alguém restaurou um backup pela metade.
 *
 * Import roda uma vez. Não há segunda chance de perceber que 230 viraram 229.
 *
 * Ver planejamento §6 · issue #111.
 */

export interface InvariantViolation {
  readonly invariant: 1 | 2 | 3 | 4;
  readonly message: string;
  /** Ids legados envolvidos, para quem for investigar no banco de origem. */
  readonly legacyIds: readonly number[];
}

export class ImportInvariantError extends Error {
  constructor(readonly violations: readonly InvariantViolation[]) {
    super(
      `O import parou: ${violations.length} invariante(s) violada(s).\n` +
        violations.map((entry) => `  ${entry.invariant}. ${entry.message}`).join("\n"),
    );
    this.name = "ImportInvariantError";
  }
}

export interface InvariantInput {
  readonly nodes: readonly {
    readonly IdQuestao: number;
    readonly IdQuestao_Pai: number | null;
    readonly TipoQuestao: number;
  }[];
  readonly options: readonly {
    readonly IdQuestao: number;
    readonly Correta: number | boolean;
  }[];
}

/**
 * Confere as quatro. Devolve a lista — quem chama decide parar.
 *
 * Todas de uma vez, e não na primeira falha: quem vai investigar o acervo de origem prefere a
 * lista inteira a descobrir um problema por execução.
 */
export function checkInvariants(input: InvariantInput): readonly InvariantViolation[] {
  const violations: InvariantViolation[] = [];

  const ids = new Set(input.nodes.map((node) => node.IdQuestao));

  /* 1 — múltipla escolha tem exatamente uma correta */
  const correctByQuestion = new Map<number, number>();
  for (const option of input.options) {
    const isCorrect = option.Correta === true || option.Correta === 1;
    if (!isCorrect) continue;
    correctByQuestion.set(option.IdQuestao, (correctByQuestion.get(option.IdQuestao) ?? 0) + 1);
  }

  const missing: number[] = [];
  const multiple: number[] = [];

  for (const node of input.nodes) {
    // `TipoQuestao = 2` é "5 Alternativas" — o único com gabarito único obrigatório. Discursiva
    // não tem alternativa, e os tipos 3–7 não têm linhas no acervo.
    if (node.TipoQuestao !== 2) continue;

    const count = correctByQuestion.get(node.IdQuestao) ?? 0;
    if (count === 0) missing.push(node.IdQuestao);
    if (count > 1) multiple.push(node.IdQuestao);
  }

  if (missing.length > 0) {
    violations.push({
      invariant: 1,
      message: `${missing.length} questão(ões) de múltipla escolha sem alternativa correta.`,
      legacyIds: missing,
    });
  }
  if (multiple.length > 0) {
    violations.push({
      invariant: 1,
      message: `${multiple.length} questão(ões) com mais de uma alternativa correta.`,
      legacyIds: multiple,
    });
  }

  /* 2 — todo pai existe */
  const orphans = input.nodes
    .filter((node) => node.IdQuestao_Pai !== null && !ids.has(node.IdQuestao_Pai))
    .map((node) => node.IdQuestao);

  if (orphans.length > 0) {
    violations.push({
      invariant: 2,
      message: `${orphans.length} nó(s) apontam para um pai que não existe nesta biblioteca.`,
      legacyIds: orphans,
    });
  }

  /* 3 — sem ciclo */
  const parentOf = new Map(input.nodes.map((node) => [node.IdQuestao, node.IdQuestao_Pai]));
  const inCycle: number[] = [];

  for (const node of input.nodes) {
    // Caminhada com passo duplo (Floyd): detecta ciclo sem guardar o caminho, e um acervo com
    // trezentos nós não justifica alocar um `Set` por nó só para isso.
    let slow: number | null = node.IdQuestao;
    let fast: number | null = node.IdQuestao;

    while (fast !== null) {
      fast = parentOf.get(fast) ?? null;
      if (fast === null) break;
      fast = parentOf.get(fast) ?? null;
      slow = parentOf.get(slow as number) ?? null;

      if (fast !== null && fast === slow) {
        inCycle.push(node.IdQuestao);
        break;
      }
    }
  }

  if (inCycle.length > 0) {
    violations.push({
      invariant: 3,
      message: `${inCycle.length} nó(s) estão num ciclo da árvore.`,
      legacyIds: inCycle,
    });
  }

  return violations;
}

/**
 * A quarta invariante — idempotência — é diferente das outras: ela não se verifica **antes** do
 * import, e sim comparando duas execuções.
 *
 * Aqui só se declara o que a segunda execução pode fazer: encontrar tudo que já existe, e não
 * criar nada. Um import que criasse duplicatas na segunda rodada seria pior que um que falhasse,
 * porque o acervo passaria a ter duas cópias de cada questão sem nenhum aviso.
 */
export interface IdempotencyOutcome {
  readonly created: number;
  readonly matched: number;
}

export function assertIdempotent(second: IdempotencyOutcome): void {
  if (second.created > 0) {
    throw new ImportInvariantError([
      {
        invariant: 4,
        message:
          `A segunda execução criou ${second.created} registro(s). ` +
          "O import precisa ser idempotente por `legacyId` + `workspaceId`.",
        legacyIds: [],
      },
    ]);
  }
}
