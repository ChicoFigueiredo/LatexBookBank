import { describe, expect, it } from "vitest";

import {
  countByState,
  FAILED_METHOD,
  pendingQueue,
  stateOf,
  type CaptureFacts,
} from "@modules/recognition/domain/capture-queue";

/**
 * Slice 9 — a fila de captura.
 *
 * O que estes testes fixam é a decisão de desenho, não a mecânica: a fila é **derivada** dos
 * recortes que já existem, e não uma tabela paralela. Cada estado sai de um fato do banco, e é
 * por isso que fechar a aba no meio de dez capturas não perde nada.
 */

const fato = (over: Partial<CaptureFacts> = {}): CaptureFacts => ({
  anchorId: "a1",
  cropAssetId: "crop-1",
  pageNumber: 3,
  createdAt: new Date("2026-08-11T12:00:00.000Z"),
  recognizedText: null,
  extractionMethod: null,
  extractionModel: null,
  hasQuestion: false,
  ...over,
});

describe("o estado de um recorte", () => {
  it("recorte salvo e nada mais: aguardando", () => {
    expect(stateOf(fato())).toBe("queued");
  });

  it("com transcrição guardada: revisar", () => {
    // É o que faz o trabalho sobreviver ao recarregamento — a transcrição está na âncora, não na
    // memória da aba.
    expect(stateOf(fato({ recognizedText: "Calcule $x^2$" }))).toBe("review");
  });

  it("transcrição em branco não conta como revisar", () => {
    expect(stateOf(fato({ recognizedText: "   " }))).toBe("queued");
  });

  it("falha registrada vence a transcrição parcial", () => {
    // Uma falha pode ter deixado texto pela metade. Mostrar "revisar" ali esconderia que a
    // execução não terminou.
    expect(
      stateOf(fato({ recognizedText: "meio ", extractionMethod: FAILED_METHOD })),
    ).toBe("error");
  });

  it("questão ligada: aprovado, e sai da fila", () => {
    expect(stateOf(fato({ hasQuestion: true, recognizedText: "x" }))).toBe("approved");
  });
});

describe("a fila", () => {
  it("mostra só o que ainda dá trabalho, do mais recente ao mais antigo", () => {
    const items = pendingQueue([
      fato({ anchorId: "velho", createdAt: new Date("2026-08-10T12:00:00.000Z") }),
      fato({ anchorId: "aprovado", hasQuestion: true }),
      fato({ anchorId: "novo", createdAt: new Date("2026-08-11T18:00:00.000Z") }),
    ]);

    // O aprovado sai: a questão criada **é** o registro, e a origem dela aponta para este mesmo
    // recorte. Mantê-lo faria a lista de pendências crescer para sempre.
    expect(items.map((item) => item.anchorId)).toEqual(["novo", "velho"]);
  });

  it("conta por estado — é o número que o rail mostra", () => {
    const items = pendingQueue([
      fato({ anchorId: "1" }),
      fato({ anchorId: "2", recognizedText: "x" }),
      fato({ anchorId: "3", extractionMethod: FAILED_METHOD }),
      fato({ anchorId: "4", hasQuestion: true }),
    ]);

    expect(countByState(items)).toEqual({ queued: 1, review: 1, error: 1, approved: 0 });
  });

  it("fila vazia é lista vazia, não erro", () => {
    expect(pendingQueue([])).toEqual([]);
  });
});
