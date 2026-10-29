import { describe, expect, it } from "vitest";

import { saveCrop, type CropWriter, type PersistCrop } from "@modules/assets/application/save-crop";
import { InvalidAnchorError } from "@modules/assets/domain/source-anchor";
import {
  CaptureInUseError,
  CaptureNotFoundError,
  discardCapture,
} from "@modules/recognition/application/discard-capture";
import { recognizeCrop } from "@modules/recognition/application/recognize-crop";
import {
  MathRecognitionError,
  type MathRecognitionProvider,
  type StorageProvider,
} from "@/shared/ports";

/**
 * Os casos de uso da captura sem banco e sem rede (STE-03, STM-04).
 *
 * Recortar, reconhecer e descartar decidiam na rota ou no adaptador. Aqui as decisões são
 * provadas com portas em memória; `tests/capture-routes.test.ts` prova as mesmas contra o SQLite.
 */

describe("saveCrop", () => {
  function deps(owner: { questionId: string | null } | null = { questionId: "q1" }) {
    const puts: string[] = [];
    const persisted: PersistCrop[] = [];
    const writer: CropWriter = {
      findSource: async (id) => (id === "pdf" ? { id, workspaceId: "w1" } : null),
      resolveOwner: async () => owner,
      persist: async (input) => {
        persisted.push(input);
        return { anchorId: "a1", cropAssetId: "c1" };
      },
    };
    const storage = {
      put: async (input: { originalFilename: string }) => {
        puts.push(input.originalFilename);
        return { storageKey: "w1/abc.png", sha256: "abc", sizeBytes: 3 };
      },
    } as unknown as StorageProvider;
    return { writer, storage, puts, persisted };
  }

  const command = {
    sourceAssetId: "pdf",
    publicationId: "p1",
    questionId: "q1",
    pageNumber: 2,
    box: { x: 0.1, y: 0.1, width: 0.5, height: 0.2 },
    rotation: null,
    sourceText: null,
    image: new Uint8Array([1, 2, 3]),
  };

  it("grava o arquivo e entrega as três linhas juntas à porta, com a questão", async () => {
    const { writer, storage, puts, persisted } = deps();

    expect(await saveCrop({ writer, storage }, command)).toEqual({
      anchorId: "a1",
      cropAssetId: "c1",
      sourceAssetId: "pdf",
    });
    expect(puts).toEqual(["crop-p2.png"]);
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toMatchObject({
      crop: { workspaceId: "w1", kind: "CROP" },
      anchor: { publicationId: "p1", sourceAssetId: "pdf", pageNumber: 2 },
      questionId: "q1",
    });
  });

  it("caixa fora da página é recusada antes de qualquer escrita, até do arquivo", async () => {
    const { writer, storage, puts, persisted } = deps();

    await expect(
      saveCrop({ writer, storage }, { ...command, box: { ...command.box, width: 2 } }),
    ).rejects.toBeInstanceOf(InvalidAnchorError);
    expect(puts).toEqual([]);
    expect(persisted).toEqual([]);
  });
});

describe("discardCapture", () => {
  const store = (usage: { inUse: boolean } | null) => {
    const discarded: string[] = [];
    return {
      discarded,
      store: {
        usageOf: async () => usage,
        discard: async (id: string) => {
          discarded.push(id);
        },
      },
    };
  };

  it("recorte que virou questão não sai", async () => {
    const { store: s, discarded } = store({ inUse: true });

    await expect(discardCapture(s, "a1")).rejects.toBeInstanceOf(CaptureInUseError);
    expect(discarded).toEqual([]);
  });

  it("recorte que já saiu é 'não encontrado'", async () => {
    const { store: s } = store(null);

    await expect(discardCapture(s, "a1")).rejects.toBeInstanceOf(CaptureNotFoundError);
  });

  it("recorte solto sai", async () => {
    const { store: s, discarded } = store({ inUse: false });

    await discardCapture(s, "a1");

    expect(discarded).toEqual(["a1"]);
  });
});

describe("recognizeCrop", () => {
  const now = () => new Date("2026-10-28T12:00:00.000Z");

  function log() {
    const calls: string[] = [];
    return {
      calls,
      log: {
        recordRecognition: async (anchorId: string, input: { latex: string }) => {
          calls.push(`ok ${anchorId} ${input.latex}`);
        },
        recordRecognitionFailure: async (anchorId: string, input: { error: string }) => {
          calls.push(`falha ${anchorId} ${input.error}`);
        },
      },
    };
  }

  const recognizer = (outcome: string | Error): MathRecognitionProvider => ({
    id: "fake",
    recognize: async () => {
      if (outcome instanceof Error) throw outcome;
      return {
        latex: outcome,
        confidence: null,
        alternatives: [],
        providerId: "fake",
        model: "m",
        durationMs: 1,
      };
    },
  });

  const command = {
    cropAssetId: "c1",
    anchorId: "a1",
    image: new Uint8Array(),
    mimeType: "image/png",
    mode: "display" as const,
  };

  it("devolve o candidato e grava a transcrição na âncora", async () => {
    const { log: l, calls } = log();

    const candidate = await recognizeCrop({ recognizer: recognizer("x^2"), log: l, now }, command);

    expect(candidate).toMatchObject({ cropAssetId: "c1", state: "candidate" });
    expect(calls).toEqual(["ok a1 x^2"]);
  });

  it("a falha do provider fica na âncora, e o erro sobe para a rota dizer 502", async () => {
    const { log: l, calls } = log();
    const falha = new MathRecognitionError("timeout", "fake");

    await expect(
      recognizeCrop({ recognizer: recognizer(falha), log: l, now }, command),
    ).rejects.toBe(falha);
    expect(calls).toEqual(["falha a1 timeout"]);
  });

  it("sem âncora, reconhece e não grava nada", async () => {
    const { log: l, calls } = log();

    await recognizeCrop(
      { recognizer: recognizer("y"), log: l, now },
      { ...command, anchorId: null },
    );

    expect(calls).toEqual([]);
  });
});
