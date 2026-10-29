import type { SkippedLegacyFigure } from "./import-legacy-figures";
import type { LegacyLibraryMapping } from "./map-legacy-library";

/**
 * O relatório do import legado — as seis categorias da Fase 11, como dado (SPA-09).
 *
 * Era texto de console espalhado pelo dry-run e pela gravação: para saber quantas questões ficaram
 * de fora e por quê, era preciso reler a saída dos scripts, e duas execuções não se comparavam. O
 * mesmo objeto sai do dry-run e da gravação, e o script o grava em JSON — um `diff` entre duas
 * rodadas diz o que mudou.
 *
 * - **importados**: o que entra (no dry-run, o que entraria; gravado, o que o writer contou);
 * - **atualizados**: sempre 0 — o import só cria, e diz isso em vez de omitir;
 * - **inconsistentes**: questões excluídas por invariante, e dificuldades fora da escala coagidas;
 * - **ignorados**: figuras sem questão dona (de nó estrutural ou de questão excluída);
 * - **órfãos**: questões cujo `idPublication` não existe em `Publication`;
 * - **assets ausentes**: figuras que o LaTeX cita e o disco não tem (ou que não dá para importar).
 */

export interface LegacyImportEntry {
  readonly legacyId: number;
  readonly motivo: string;
}

export interface LegacyImportReportJson {
  readonly dryRun: boolean;
  readonly workspaceId: string | null;
  readonly importados: {
    readonly publicacoes: number;
    readonly nos: number;
    readonly questoes: number;
    readonly alternativas: number;
    readonly figuras: number;
  };
  readonly atualizados: { readonly total: 0; readonly nota: string };
  readonly inconsistentes: readonly LegacyImportEntry[];
  readonly ignorados: readonly LegacyImportEntry[];
  readonly orfaos: readonly LegacyImportEntry[];
  readonly assetsAusentes: readonly LegacyImportEntry[];
}

/** O que o writer devolve depois de gravar (`PrismaLegacyImportWriter.write`). */
export interface WrittenLegacyImport {
  readonly workspaceId: string;
  readonly publications: number;
  readonly nodes: number;
  readonly questions: number;
  readonly options: number;
  readonly figures: number;
}

/** Só o que o relatório lê do mapeamento — o resto do portable não importa aqui. */
type MappingForReport = Pick<
  LegacyLibraryMapping,
  "excluded" | "coercedDifficulty" | "orphanPublicationRefs" | "unattachedFigures"
> & {
  readonly portable: {
    readonly publications: readonly {
      readonly nodes: readonly {
        readonly question: { readonly options: readonly unknown[] } | null;
      }[];
    }[];
  };
};

export function buildLegacyImportReport(input: {
  readonly mapping: MappingForReport;
  readonly skippedFigures: readonly Pick<
    SkippedLegacyFigure,
    "legacyQuestionId" | "field" | "ref" | "reason"
  >[];
  /** Figuras resolvidas do disco que têm questão dona — as que o writer vai gravar. */
  readonly attachedFigures: number;
  /** `null` no dry-run. */
  readonly written: WrittenLegacyImport | null;
}): LegacyImportReportJson {
  const { mapping, written } = input;
  const nodes = mapping.portable.publications.flatMap((publication) => publication.nodes);
  const questions = nodes.filter((node) => node.question !== null);

  return {
    dryRun: written === null,
    workspaceId: written?.workspaceId ?? null,
    importados: written
      ? {
          publicacoes: written.publications,
          nos: written.nodes,
          questoes: written.questions,
          alternativas: written.options,
          figuras: written.figures,
        }
      : {
          publicacoes: mapping.portable.publications.length,
          nos: nodes.length,
          questoes: questions.length,
          alternativas: questions.reduce(
            (total, node) => total + (node.question?.options.length ?? 0),
            0,
          ),
          figuras: input.attachedFigures,
        },
    atualizados: { total: 0, nota: "o import só cria: nada existente é atualizado" },
    inconsistentes: [
      ...mapping.excluded.map((entry) => ({ legacyId: entry.legacyId, motivo: entry.reason })),
      ...mapping.coercedDifficulty.map((legacyId) => ({
        legacyId,
        motivo: "dificuldade fora da escala, coagida para 5",
      })),
    ],
    ignorados: mapping.unattachedFigures.map((entry) => ({
      legacyId: entry.legacyQuestionId,
      motivo: `figura ${entry.relativePath} sem questão dona (${
        entry.reason === "no-estrutural" ? "nó estrutural" : "questão excluída"
      })`,
    })),
    orfaos: mapping.orphanPublicationRefs.map((entry) => ({
      legacyId: entry.legacyQuestionId,
      motivo: `idPublication ${entry.idPublication} não existe em Publication`,
    })),
    assetsAusentes: input.skippedFigures.map((entry) => ({
      legacyId: entry.legacyQuestionId,
      motivo: `${entry.field} cita ${entry.ref}: ${entry.reason}`,
    })),
  };
}
