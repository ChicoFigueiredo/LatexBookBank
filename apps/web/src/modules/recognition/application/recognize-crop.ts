import { MathRecognitionError, type MathRecognitionProvider } from "@/shared/ports";

import { candidateFrom, type RecognitionCandidate } from "../domain/recognition-review";

/**
 * Reconhece a matemática de um recorte e deixa o resultado — ou a falha — na âncora.
 *
 * Devolve um **candidato**, nunca um valor aplicado: o único caminho até `accepted` passa pela
 * revisão humana (spec §19). Gravar na âncora **não aprova nada**; é o que faz o trabalho
 * sobreviver ao recarregamento (§26, §53): reconhecer dez recortes e fechar a aba não pode perder
 * as dez transcrições.
 *
 * A decisão do que gravar, e quando, morava na rota (STE-03). Aqui ela vale para qualquer caminho
 * que reconheça um recorte.
 *
 * Ver spec §19 · issue #125.
 */

export type RecognitionMode = "display" | "inline" | "mixed" | "text";

/** Onde o resultado de cada tentativa fica guardado: a âncora do recorte. */
export interface RecognitionLog {
  recordRecognition(
    anchorId: string,
    input: {
      readonly latex: string;
      readonly method: string;
      readonly model: string | null;
      readonly metadataJson: string;
    },
  ): Promise<unknown>;
  recordRecognitionFailure(
    anchorId: string,
    input: { readonly error: string; readonly at: Date },
  ): Promise<unknown>;
}

export interface RecognizeCropCommand {
  readonly cropAssetId: string;
  /** Opcional: reconhecer um recorte que ainda não foi salvo é caso legítimo. */
  readonly anchorId: string | null;
  readonly image: Uint8Array;
  readonly mimeType: string;
  readonly mode: RecognitionMode;
}

export async function recognizeCrop(
  deps: {
    readonly recognizer: MathRecognitionProvider;
    readonly log: RecognitionLog;
    readonly now?: () => Date;
  },
  command: RecognizeCropCommand,
): Promise<RecognitionCandidate> {
  const now = deps.now ?? (() => new Date());

  let result;
  try {
    result = await deps.recognizer.recognize({
      image: command.image,
      mimeType: command.mimeType,
      mode: command.mode,
    });
  } catch (error) {
    // A falha fica **registrada na âncora**: é o que faz a fila mostrar "erro" em vez de
    // "aguardando" depois de um recarregamento. A transcrição que a âncora já tinha **fica**
    // (#253): tentar de novo e dar timeout não pode apagar o que a tentativa anterior trouxe.
    // Falhar ao registrar não troca o erro que a pessoa precisa ver.
    if (error instanceof MathRecognitionError && command.anchorId !== null) {
      await deps.log
        .recordRecognitionFailure(command.anchorId, { error: error.message, at: now() })
        .catch(() => undefined);
    }
    throw error;
  }

  if (command.anchorId !== null) {
    await deps.log.recordRecognition(command.anchorId, {
      latex: result.latex,
      method: `recognition:${result.providerId}`,
      model: result.model,
      metadataJson: JSON.stringify({
        mode: command.mode,
        durationMs: result.durationMs,
        confidence: result.confidence,
        recognizedAt: now().toISOString(),
      }),
    });
  }

  return candidateFrom(command.cropAssetId, result);
}
