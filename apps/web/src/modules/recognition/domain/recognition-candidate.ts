/**
 * O contrato intermediário entre o OCR e o acervo (§20 do prompt do time).
 *
 * A regra que ele existe para tornar estrutural:
 *
 * > **OCR propõe; o domínio editorial só persiste após revisão.**
 *
 * `RecognitionCandidate` (em `recognition-review.ts`) é o que a tela manipula enquanto a pessoa
 * confere: um recorte e um LaTeX. Este arquivo é o passo seguinte — o candidato **aprovado**, já
 * com a estrutura que uma questão precisa e com a proveniência que a torna auditável depois.
 *
 * Os dois são separados de propósito. Fundir seria fazer o objeto que a tela edita carregar campos
 * que só fazem sentido depois da decisão de criar — e o dia em que alguém passasse o objeto errado
 * adiante, o acervo herdaria um "aprovado" que ninguém aprovou.
 */

export class CandidateNotReviewedError extends Error {
  constructor() {
    super(
      "Este candidato não foi revisado. O modelo acerta a maior parte e erra o expoente — " +
        "confira contra o recorte antes de criar a questão.",
    );
    this.name = "CandidateNotReviewedError";
  }
}

export class EmptyCandidateError extends Error {
  constructor() {
    super("Não há enunciado para criar a questão — o reconhecimento voltou vazio.");
    this.name = "EmptyCandidateError";
  }
}

/** De onde o candidato veio. Sem isto, a questão nasce sem origem — e §17 chama isso de defeito. */
export interface CandidateSource {
  /** O `SourceAnchor`: arquivo, página e caixa normalizada. */
  readonly anchorId: string;
  readonly cropAssetId: string;
}

/** O que a execução do reconhecedor registrou. Preservado inteiro (§36, §69). */
export interface RecognitionRun {
  readonly providerId: string;
  readonly model: string;
  readonly durationMs: number;
  readonly confidence: number | null;
  readonly mode: string;
  /** O LaTeX **como veio do modelo**, antes de qualquer correção humana. */
  readonly rawLatex: string;
  readonly recognizedAt: string;
}

export interface CandidateOption {
  readonly statementLatex: string;
  readonly isCorrect: boolean;
}

export interface ApprovedCandidate {
  readonly source: CandidateSource;
  readonly run: RecognitionRun;
  /** Número da questão no livro — "27", "II". Informação editorial insubstituível. */
  readonly originalLabel: string | null;
  readonly statementLatex: string;
  readonly solutionLatex: string;
  readonly options: readonly CandidateOption[];
  /** O que o produto notou e não pôde resolver sozinho. Viaja para a tela, não para o banco. */
  readonly warnings: readonly string[];
}

export interface ApproveInput {
  readonly source: CandidateSource;
  readonly run: RecognitionRun;
  readonly reviewed: boolean;
  readonly originalLabel?: string | null;
  readonly statementLatex: string;
  readonly solutionLatex?: string;
  readonly options?: readonly CandidateOption[];
}

/**
 * O único caminho de candidato para questão.
 *
 * `reviewed` é o clique de "conferi" — o gesto que a spec chama de revisão humana obrigatória.
 * Não é cerimônia removível: sem ele, `OCR → Question` seria alcançável, e o acervo passaria a
 * conter transcrições que ninguém leu com cara de dado revisado.
 *
 * Os avisos são **calculados aqui**, e não recebidos: quem chama não deveria poder silenciar um
 * alerta simplesmente não o mandando.
 */
export function approveCandidate(input: ApproveInput): ApprovedCandidate {
  if (!input.reviewed) throw new CandidateNotReviewedError();

  const statementLatex = input.statementLatex.trim();
  if (statementLatex === "") throw new EmptyCandidateError();

  const options = (input.options ?? []).map((option) => ({
    statementLatex: option.statementLatex.trim(),
    isCorrect: option.isCorrect,
  }));

  return {
    source: input.source,
    run: input.run,
    originalLabel: normalizeLabel(input.originalLabel),
    statementLatex,
    solutionLatex: (input.solutionLatex ?? "").trim(),
    options,
    warnings: warningsFor(input.run, options),
  };
}

/** O rótulo do livro, sem a pontuação que costuma vir colada: `"27."` vira `"27"`. */
function normalizeLabel(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;

  const label = raw.trim().replace(/^[([]?\s*|\s*[.)\]]?$/g, "");
  return label === "" ? null : label.slice(0, 40);
}

function warningsFor(run: RecognitionRun, options: readonly CandidateOption[]): readonly string[] {
  const warnings: string[] = [];

  // Confiança baixa não impede criar — impede criar **sem saber**. A questão nasce, e o aviso
  // fica na tela para quem decidiu.
  if (run.confidence !== null && run.confidence < 0.6) {
    warnings.push(
      `Confiança baixa (${Math.round(run.confidence * 100)}%) — reconfira contra o recorte.`,
    );
  }

  if (options.length > 0) {
    if (options.some((option) => option.statementLatex === "")) {
      warnings.push("Há alternativa vazia — o modelo pode ter perdido uma linha do recorte.");
    }
    if (!options.some((option) => option.isCorrect)) {
      warnings.push("Nenhuma alternativa marcada como correta. O gabarito fica para depois.");
    }
  }

  return warnings;
}
