import type {
  PortableNode,
  PortableOption,
  PortablePublication,
  PortableQuestion,
  PortableWorkspace,
} from "@modules/portability/domain/portable-schema";

import { checkInvariants, type InvariantViolation } from "../domain/import-invariants";
import { rewriteLegacyAssetRefs } from "../domain/legacy-asset-refs";
import type {
  LegacyLibraryContents,
  RawLegacyOptionRow,
  RawLegacyPublicationRow,
  RawLegacyQuestionRow,
} from "../domain/legacy-library-reader";
import {
  classifyNode,
  mapDifficulty,
  mapNumbering,
  optionOrder,
  siblingOrder,
  UnknownTipoQuestaoError,
} from "../domain/legacy-mapping";
import { EMPTY_LEGACY_FIGURES, type LegacyFiguresResolution } from "./import-legacy-figures";

/**
 * Legado lido → `PortableWorkspace`. Depois disso, o import é o mesmo de um `.lbb`: `toRuntime`
 * detecta colisão contra o destino, `writeImportedWorkspace` grava numa transação. Nenhuma escrita
 * nova foi inventada para a Fase 11 — só um produtor novo do formato que o import já sabe ler.
 *
 * Uma biblioteca legada não é um livro — é uma **coleção** de livros. A tabela `Publication` é o
 * livro de verdade (UUID, ISBN, capa), e `Questao.idPublication` liga cada questão a um deles.
 * Confirmado por consulta recursiva contra o acervo real (2026-08-31): uma subárvore inteira
 * pertence a um único `idPublication`, nunca mistura.
 *
 * Ver checklist Fase 11, blocos "Mapeamento" e "Execução" · issue #111.
 */

export interface MapLegacyLibraryOptions {
  readonly workspaceName: string;
  readonly workspaceSlug: string;
  /**
   * As figuras já resolvidas do disco (`resolveLegacyFigures`). Com elas, o LaTeX de cada questão
   * — e das alternativas dela — passa a citar o nome do asset, e `assets` recebe o `sha256`.
   * Sem elas o mapeamento é o de antes: texto como veio, `assets: []`.
   *
   * Vem pronto porque o mapeamento é puro e síncrono, e ler arquivo não é.
   */
  readonly figures?: LegacyFiguresResolution;
}

export interface ExcludedQuestion {
  readonly legacyId: number;
  readonly reason: string;
}

export interface UnattachedFigure {
  readonly legacyQuestionId: number;
  readonly relativePath: string;
  readonly reason: "questao-excluida" | "no-estrutural";
}

export interface LegacyLibraryMapping {
  readonly portable: PortableWorkspace;
  /**
   * Questões que violam invariante e **não entram** no portable — por decisão do Chico
   * (2026-08-31): o import segue com o resto da biblioteca em vez de recusá-la inteira. Quem
   * chama é quem decide reportar como "inconsistentes".
   */
  readonly excluded: readonly ExcludedQuestion[];
  /** Dificuldade fora da escala, coagida para o meio — perda, não erro. */
  readonly coercedDifficulty: readonly number[];
  /** Questões cujo `idPublication` não bate com nenhuma linha de `Publication` — não descartadas em silêncio. */
  readonly orphanPublicationRefs: readonly { readonly legacyQuestionId: number; readonly idPublication: number }[];
  /**
   * Figuras resolvidas do disco cuja dona **não vira questão** no portable: ou foi excluída por
   * invariante, ou é nó estrutural (um `QUESTION_GROUP` com `latexResposta`, como a Fundamentos
   * 11). O arquivo existe e o texto o cita, mas não há questão para ligar o asset — e isso precisa
   * sair no relatório, não sumir.
   */
  readonly unattachedFigures: readonly UnattachedFigure[];
}

function invariantExclusions(violations: readonly InvariantViolation[]): Map<number, string> {
  const reasons = new Map<number, string>();
  for (const violation of violations) {
    for (const legacyId of violation.legacyIds) {
      if (!reasons.has(legacyId)) reasons.set(legacyId, violation.message);
    }
  }
  return reasons;
}

const blankToNull = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
};

/**
 * O LaTeX com a figura citada pelo nome do asset.
 *
 * `originalLatex` **não** passa por aqui: é o texto de origem, guardado como veio (proveniência),
 * e nenhuma tela o compila. Reescrevê-lo seria mexer no único campo que promete não mudar.
 */
const cite = (renames: ReadonlyMap<string, string>, latex: string | null | undefined): string =>
  rewriteLegacyAssetRefs(latex ?? "", renames);

const NO_RENAMES: ReadonlyMap<string, string> = new Map();

function toPortableNodes(
  questions: readonly RawLegacyQuestionRow[],
  optionsByQuestion: ReturnType<typeof optionOrder<RawLegacyOptionRow>>,
  coercedDifficulty: number[],
  figures: LegacyFiguresResolution,
): readonly PortableNode[] {
  const orderedByParent = siblingOrder(questions);
  const nodes: PortableNode[] = [];

  for (const entries of orderedByParent.values()) {
    for (const { row, sortKey } of entries) {
      const classification = classifyNode(row.TipoQuestao);
      const isQuestion = classification.kind === "QUESTION";

      let question: PortableQuestion | null = null;
      if (isQuestion) {
        const { difficulty, coerced } = mapDifficulty(row.Dificuldade);
        if (coerced) coercedDifficulty.push(row.IdQuestao);

        // A figura de uma alternativa mora na pasta da questão dona, então o mapa de nomes é o
        // da questão — para o enunciado, a resposta e cada alternativa.
        const renames = figures.renamesByQuestion.get(row.IdQuestao) ?? NO_RENAMES;

        const optionEntries = optionsByQuestion.get(row.IdQuestao) ?? [];
        const options: PortableOption[] = optionEntries.map(
          ({ row: optionRow, sortKey: optionSortKey }): PortableOption => ({
            ref: `o${optionRow.IdQuestao_Itens}`,
            sortKey: optionSortKey,
            statementLatex: cite(renames, optionRow.latexItem),
            solutionLatex: cite(renames, optionRow.latexResposta),
            originalLatex: blankToNull(optionRow.latexOrigin),
            isCorrect: optionRow.Correta === 1,
            weight: null,
            legacyId: optionRow.IdQuestao_Itens,
            legacyMarcacao: blankToNull(optionRow.Marcacao),
          }),
        );

        question = {
          ref: `q${row.IdQuestao}`,
          type: classification.questionType as string,
          nickname: blankToNull(row.Apelido),
          statementLatex: cite(renames, row.latexQuestao),
          solutionLatex: cite(renames, row.latexResposta),
          complementLatex: cite(renames, row.latexComplemento),
          originalLatex: blankToNull(row.latexOrigin),
          difficulty,
          year: row.Ano,
          board: blankToNull(row.Banca),
          institution: blankToNull(row["Instituição"]),
          role: blankToNull(row.Cargo),
          roleLevel: blankToNull(row.Nivel_Cargo),
          publisher: null,
          videoUrl: null,
          status: "READY",
          validationStatus: "UNVALIDATED",
          legacyId: row.IdQuestao,
          tags: [],
          options,
          // Só o hash, nunca caminho (contrato do portable). Deduplicado: a mesma figura citada
          // no enunciado e na resposta é um asset só.
          assets: [
            ...new Set(
              figures.figures
                .filter((figure) => figure.legacyQuestionId === row.IdQuestao)
                .map((figure) => figure.sha256),
            ),
          ],
        };
      }

      nodes.push({
        ref: `n${row.IdQuestao}`,
        parentRef: row.IdQuestao_Pai === null ? null : `n${row.IdQuestao_Pai}`,
        kind: classification.kind,
        title: isQuestion ? null : blankToNull(row.Apelido),
        sortKey,
        numberingStyle: mapNumbering(row.Numeracao),
        originalLabel: row.Numeracao_Original === null ? null : String(row.Numeracao_Original),
        legacyId: row.IdQuestao,
        question,
      });
    }
  }

  return nodes;
}

function toPortablePublication(
  legacy: RawLegacyPublicationRow | null,
  idPublication: number,
  nodes: readonly PortableNode[],
): PortablePublication {
  return {
    ref: `p${idPublication}`,
    title: legacy?.PublicationName?.trim() || `Publicação ${idPublication}`,
    subtitle: null,
    publisher: null,
    legacyId: idPublication,
    legacyUuid: legacy?.UUID ? legacy.UUID.toLowerCase() : null,
    metadataJson: null,
    coverAsset: null,
    isbn: blankToNull(legacy?.ISBN),
    nickname: blankToNull(legacy?.PublicationNick),
    series: blankToNull(legacy?.PublicationSeries),
    notes: blankToNull(legacy?.Notes),
    authors: legacy?.AuthorSort?.trim() ? [legacy.AuthorSort.trim()] : [],
    nodes,
  };
}

export function mapLegacyLibrary(
  contents: LegacyLibraryContents,
  options: MapLegacyLibraryOptions,
): LegacyLibraryMapping {
  const { capabilities: _capabilities, publications, questions, options: optionRows } = contents;
  void _capabilities;

  const violations = checkInvariants({
    nodes: questions.map((q) => ({
      IdQuestao: q.IdQuestao,
      IdQuestao_Pai: q.IdQuestao_Pai,
      TipoQuestao: q.TipoQuestao,
    })),
    options: optionRows.map((o) => ({ IdQuestao: o.IdQuestao, Correta: o.Correta })),
  });

  const exclusionReasons = invariantExclusions(violations);

  // Tipo desconhecido é mais grave que gabarito ausente — nem sabemos se era estrutura ou
  // questão —, mas ainda não derruba a biblioteca inteira: vira exclusão relatada, como o resto.
  for (const question of questions) {
    if (exclusionReasons.has(question.IdQuestao)) continue;
    try {
      classifyNode(question.TipoQuestao);
    } catch (error) {
      if (error instanceof UnknownTipoQuestaoError) {
        exclusionReasons.set(question.IdQuestao, error.message);
      } else {
        throw error;
      }
    }
  }

  const included = questions.filter((q) => !exclusionReasons.has(q.IdQuestao));

  // Um pai excluído com filho que sobrou produziria uma árvore quebrada em silêncio — melhor
  // parar e nomear o caso do que gravar um `parentRef` que não existe em nenhum nó do arquivo.
  for (const question of included) {
    if (question.IdQuestao_Pai !== null && exclusionReasons.has(question.IdQuestao_Pai)) {
      throw new Error(
        `A questão legada ${question.IdQuestao} tem pai ${question.IdQuestao_Pai}, que foi ` +
          `excluído da importação (${exclusionReasons.get(question.IdQuestao_Pai)}). ` +
          "Importar o filho sem o pai quebraria a árvore — decida o que fazer com os dois juntos.",
      );
    }
  }

  const publicationByLegacyId = new Map(publications.map((row) => [row.idPublication, row]));
  const orphanPublicationRefs: { legacyQuestionId: number; idPublication: number }[] = [];

  const byPublication = new Map<number, RawLegacyQuestionRow[]>();
  for (const question of included) {
    if (!publicationByLegacyId.has(question.idPublication)) {
      orphanPublicationRefs.push({
        legacyQuestionId: question.IdQuestao,
        idPublication: question.idPublication,
      });
    }
    const group = byPublication.get(question.idPublication) ?? [];
    group.push(question);
    byPublication.set(question.idPublication, group);
  }

  const optionsByQuestion = optionOrder(optionRows);
  const coercedDifficulty: number[] = [];
  const figures = options.figures ?? EMPTY_LEGACY_FIGURES;

  const portablePublications: PortablePublication[] = [...byPublication.entries()]
    .sort(([a], [b]) => a - b)
    .map(([idPublication, groupQuestions]) => {
      const nodes = toPortableNodes(groupQuestions, optionsByQuestion, coercedDifficulty, figures);
      return toPortablePublication(
        publicationByLegacyId.get(idPublication) ?? null,
        idPublication,
        nodes,
      );
    });

  const excluded: ExcludedQuestion[] = [...exclusionReasons.entries()].map(
    ([legacyId, reason]) => ({ legacyId, reason }),
  );

  const questionRows = new Set(
    included.filter((q) => classifyNode(q.TipoQuestao).kind === "QUESTION").map((q) => q.IdQuestao),
  );
  const unattachedFigures: UnattachedFigure[] = figures.figures
    .filter((figure) => !questionRows.has(figure.legacyQuestionId))
    .map((figure) => ({
      legacyQuestionId: figure.legacyQuestionId,
      relativePath: figure.relativePath,
      reason: exclusionReasons.has(figure.legacyQuestionId) ? "questao-excluida" : "no-estrutural",
    }));

  return {
    portable: {
      name: options.workspaceName,
      slug: options.workspaceSlug,
      tags: [],
      publications: portablePublications,
    },
    excluded,
    coercedDifficulty,
    orphanPublicationRefs,
    unattachedFigures,
  };
}
