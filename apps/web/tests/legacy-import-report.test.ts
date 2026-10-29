import { describe, expect, it } from "vitest";

import { buildLegacyImportReport } from "@modules/legacy-import/application/legacy-import-report";

/**
 * O relatório do import legado, estruturado (SPA-09).
 *
 * Era texto de console espalhado por três scripts: para saber quantas questões ficaram de fora e
 * por quê, era preciso reler a saída de cada um, e duas execuções não se comparavam. Agora é um
 * objeto com as seis categorias da Fase 11, o mesmo no dry-run e na gravação.
 */

const mapping = {
  portable: {
    publications: [
      {
        nodes: [
          { question: { options: [{}, {}] } },
          { question: null },
          { question: { options: [{}] } },
        ],
      },
    ],
  },
  excluded: [{ legacyId: 9, reason: "nenhuma alternativa correta" }],
  coercedDifficulty: [12],
  orphanPublicationRefs: [{ legacyQuestionId: 30, idPublication: 99 }],
  unattachedFigures: [
    { legacyQuestionId: 11, relativePath: "images/g", reason: "no-estrutural" as const },
  ],
};
const skipped = [
  {
    legacyQuestionId: 40,
    field: "latexQuestao",
    ref: "images/h",
    reason: "arquivo-ausente" as const,
  },
];

describe("buildLegacyImportReport", () => {
  it("no dry-run, conta o que entraria e lista cada ausência com o motivo", () => {
    const report = buildLegacyImportReport({
      mapping,
      skippedFigures: skipped,
      attachedFigures: 3,
      written: null,
    });

    expect(report).toEqual({
      dryRun: true,
      workspaceId: null,
      importados: { publicacoes: 1, nos: 3, questoes: 2, alternativas: 3, figuras: 3 },
      atualizados: { total: 0, nota: "o import só cria: nada existente é atualizado" },
      inconsistentes: [
        { legacyId: 9, motivo: "nenhuma alternativa correta" },
        { legacyId: 12, motivo: "dificuldade fora da escala, coagida para 5" },
      ],
      ignorados: [{ legacyId: 11, motivo: "figura images/g sem questão dona (nó estrutural)" }],
      orfaos: [{ legacyId: 30, motivo: "idPublication 99 não existe em Publication" }],
      assetsAusentes: [{ legacyId: 40, motivo: "latexQuestao cita images/h: arquivo-ausente" }],
    });
  });

  it("gravado, os números são os do writer — o que de fato entrou", () => {
    const report = buildLegacyImportReport({
      mapping,
      skippedFigures: [],
      attachedFigures: 3,
      written: {
        workspaceId: "ws-1",
        publications: 1,
        nodes: 3,
        questions: 2,
        options: 3,
        figures: 2,
      },
    });

    expect(report.dryRun).toBe(false);
    expect(report.workspaceId).toBe("ws-1");
    expect(report.importados.figuras).toBe(2);
  });

  it("é JSON: duas execuções se comparam com um diff", () => {
    const report = buildLegacyImportReport({
      mapping,
      skippedFigures: skipped,
      attachedFigures: 3,
      written: null,
    });

    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });
});
