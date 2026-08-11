import { describe, expect, it } from "vitest";

import type {
  DocumentTreeRepository,
  TreeNodeRecord,
} from "@modules/document-tree/domain/document-tree-repository";
import type {
  CreatedQuestion,
  NewQuestionNode,
  QuestionCreator,
} from "@modules/questions/application/create-question";
import {
  RecognitionProvenanceError,
  createQuestionFromRecognition,
  type RecognitionProvenanceWriter,
} from "@modules/recognition/application/create-question-from-recognition";
import {
  CandidateNotReviewedError,
  EmptyCandidateError,
  approveCandidate,
  type RecognitionRun,
} from "@modules/recognition/domain/recognition-candidate";

/**
 * Slice 8 — o fim do copia-e-cola entre telas.
 *
 * A tela de ingestão guardava o LaTeX conferido com o recado "cole na questão". O que estes testes
 * fixam é o contrato que substitui aquilo: **OCR propõe, o humano aprova, o domínio persiste** —
 * e nada persiste sem o gesto do meio.
 */

const run = (over: Partial<RecognitionRun> = {}): RecognitionRun => ({
  providerId: "vision",
  model: "gemma3:12b",
  durationMs: 1200,
  confidence: 0.92,
  mode: "mixed",
  rawLatex: "Calcule $x^3$",
  recognizedAt: "2026-08-11T12:00:00.000Z",
  ...over,
});

const source = { anchorId: "anchor-1", cropAssetId: "crop-1" };

class FakeTree implements DocumentTreeRepository {
  constructor(private readonly records: readonly TreeNodeRecord[] = []) {}
  listByPublication = async (): Promise<readonly TreeNodeRecord[]> => this.records;
}

class RecordingCreator implements QuestionCreator {
  received: NewQuestionNode | null = null;
  createQuestionWithNode = async (input: NewQuestionNode): Promise<CreatedQuestion> => {
    this.received = input;
    return { questionId: "q1", nodeId: "n1", publicationId: input.publicationId };
  };
}

class RecordingProvenance implements RecognitionProvenanceWriter {
  received: { anchorId: string; run: RecognitionRun } | null = null;
  constructor(private readonly exists = true) {}

  recordRun = async (anchorId: string, value: RecognitionRun): Promise<boolean> => {
    this.received = { anchorId, run: value };
    return this.exists;
  };
}

describe("aprovar o candidato", () => {
  it("recusa sem o gesto de revisão — não há atalho de OCR para questão", () => {
    expect(() =>
      approveCandidate({ source, run: run(), reviewed: false, statementLatex: "Calcule $x^2$" }),
    ).toThrow(CandidateNotReviewedError);
  });

  it("recusa enunciado vazio", () => {
    expect(() =>
      approveCandidate({ source, run: run(), reviewed: true, statementLatex: "   " }),
    ).toThrow(EmptyCandidateError);
  });

  it("limpa a pontuação colada ao número do livro", () => {
    // "27." e "(27)" são como o rótulo sai do OCR; o dado editorial é "27".
    expect(
      approveCandidate({ source, run: run(), reviewed: true, statementLatex: "x", originalLabel: "27." })
        .originalLabel,
    ).toBe("27");
    expect(
      approveCandidate({ source, run: run(), reviewed: true, statementLatex: "x", originalLabel: "(II)" })
        .originalLabel,
    ).toBe("II");
  });

  it("calcula os avisos em vez de recebê-los", () => {
    // Quem chama não pode silenciar um alerta simplesmente não o mandando.
    const approved = approveCandidate({
      source,
      run: run({ confidence: 0.3 }),
      reviewed: true,
      statementLatex: "Calcule",
      options: [
        { statementLatex: "a", isCorrect: false },
        { statementLatex: "", isCorrect: false },
      ],
    });

    expect(approved.warnings).toHaveLength(3);
    expect(approved.warnings.join(" ")).toContain("Confiança baixa");
    expect(approved.warnings.join(" ")).toContain("alternativa vazia");
    expect(approved.warnings.join(" ")).toContain("Nenhuma alternativa marcada");
  });

  it("confiança alta e gabarito definido não geram aviso", () => {
    const approved = approveCandidate({
      source,
      run: run(),
      reviewed: true,
      statementLatex: "Calcule",
      options: [
        { statementLatex: "a", isCorrect: true },
        { statementLatex: "b", isCorrect: false },
      ],
    });

    expect(approved.warnings).toEqual([]);
  });
});

describe("criar questão a partir do reconhecimento", () => {
  const candidate = () =>
    approveCandidate({
      source,
      run: run(),
      reviewed: true,
      statementLatex: "Calcule $x^2$",
      originalLabel: "27",
      options: [
        { statementLatex: "1", isCorrect: false },
        { statementLatex: "2", isCorrect: true },
      ],
    });

  it("liga a questão à origem e devolve rota navegável", async () => {
    const creator = new RecordingCreator();

    const result = await createQuestionFromRecognition(
      { reader: new FakeTree(), creator, provenance: new RecordingProvenance() },
      {
        publicationId: "p1",
        placement: { kind: "lastChild", parentId: null },
        type: "MULTIPLE_CHOICE",
        candidate: candidate(),
      },
    );

    expect(creator.received?.sourceAnchorId).toBe("anchor-1");
    expect(creator.received?.statementLatex).toBe("Calcule $x^2$");
    expect(creator.received?.originalLabel).toBe("27");
    expect(creator.received?.options).toHaveLength(2);
    // §73: depois de criar, é preciso poder selecionar, navegar e abrir o editor.
    expect(result.href).toBe("/publications/p1?node=n1");
  });

  it("registra a execução do reconhecedor **antes** de criar a questão", async () => {
    // Se a âncora não existe, a questão nasceria sem origem e ninguém notaria até alguém
    // perguntar de onde ela veio. Falhar antes não perde nada — nada foi criado ainda.
    const creator = new RecordingCreator();

    await expect(
      createQuestionFromRecognition(
        { reader: new FakeTree(), creator, provenance: new RecordingProvenance(false) },
        {
          publicationId: "p1",
          placement: { kind: "lastChild", parentId: null },
          type: "DISCURSIVE",
          candidate: candidate(),
        },
      ),
    ).rejects.toThrow(RecognitionProvenanceError);

    expect(creator.received, "a questão não pode ter sido criada").toBeNull();
  });

  it("preserva o LaTeX cru do modelo na proveniência", async () => {
    // É o que permite responder "o modelo errou ou eu digitei errado?" seis meses depois (§69).
    const provenance = new RecordingProvenance();

    await createQuestionFromRecognition(
      { reader: new FakeTree(), creator: new RecordingCreator(), provenance },
      {
        publicationId: "p1",
        placement: { kind: "lastChild", parentId: null },
        type: "MULTIPLE_CHOICE",
        candidate: candidate(),
      },
    );

    expect(provenance.received?.run.rawLatex).toBe("Calcule $x^3$");
    expect(provenance.received?.run.model).toBe("gemma3:12b");
  });

  it("sem alternativas reconhecidas, o tipo decide quantas nascem", async () => {
    const creator = new RecordingCreator();

    await createQuestionFromRecognition(
      { reader: new FakeTree(), creator, provenance: new RecordingProvenance() },
      {
        publicationId: "p1",
        placement: { kind: "lastChild", parentId: null },
        type: "MULTIPLE_CHOICE",
        candidate: approveCandidate({
          source,
          run: run(),
          reviewed: true,
          statementLatex: "Só o enunciado",
        }),
      },
    );

    expect(creator.received?.options).toBeUndefined();
    expect(creator.received?.blueprint.optionSortKeys).toHaveLength(5);
  });
});
