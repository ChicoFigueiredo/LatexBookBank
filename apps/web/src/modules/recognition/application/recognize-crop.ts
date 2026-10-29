import {
  AiProviderError,
  MathRecognitionError,
  type MathRecognitionProvider,
} from "@/shared/ports";

import type { RecognitionMode } from "../domain/recognition-mode";
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

export type { RecognitionMode } from "../domain/recognition-mode";

/**
 * Não há modelo de visão configurado — e reconhecer com o modelo de texto devolveria algo sem
 * sentido. O 503 sai da tabela de `app/api/http.ts` (ADR 0011).
 */
export class VisionNotConfiguredError extends Error {
  constructor() {
    super("Defina `AI_BASE_URL` e `AI_VISION_MODEL` em `apps/web/.env.local`.");
    this.name = "VisionNotConfiguredError";
  }
}

/**
 * A âncora e o recorte que foi lido. Os dois vêm do formulário, e a gravação só acontece quando a
 * âncora é mesmo a daquele recorte (SEC-06): a transcrição de uma imagem não vai para outra.
 */
export interface CropAnchor {
  readonly anchorId: string;
  readonly cropAssetId: string;
}

/** Onde o resultado de cada tentativa fica guardado: a âncora do recorte. */
export interface RecognitionLog {
  recordRecognition(
    anchor: CropAnchor,
    input: {
      readonly latex: string;
      readonly method: string;
      readonly model: string | null;
      readonly metadataJson: string;
    },
  ): Promise<unknown>;
  recordRecognitionFailure(
    anchor: CropAnchor,
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
    /**
     * Montado na hora do pedido, e não antes: um endpoint que exige chave e está sem ela recusa
     * ao montar o provider (ARQ-07), e essa recusa precisa seguir o caminho de qualquer falha do
     * reconhecimento — registrada na âncora, com a mensagem que diz o que configurar.
     */
    readonly recognizer: () => MathRecognitionProvider;
    readonly log: RecognitionLog;
    readonly now?: () => Date;
  },
  command: RecognizeCropCommand,
): Promise<RecognitionCandidate> {
  const now = deps.now ?? (() => new Date());
  const anchor: CropAnchor | null =
    command.anchorId === null
      ? null
      : { anchorId: command.anchorId, cropAssetId: command.cropAssetId };

  let result;
  try {
    result = await deps.recognizer().recognize({
      image: command.image,
      mimeType: command.mimeType,
      mode: command.mode,
    });
  } catch (caught) {
    // O provider que não monta (sem chave) falha como o reconhecimento: é a mesma resposta para
    // quem pediu, e o mesmo registro na âncora.
    const error =
      caught instanceof AiProviderError
        ? new MathRecognitionError(caught.message, caught.providerId, caught)
        : caught;
    // A falha fica **registrada na âncora**: é o que faz a fila mostrar "erro" em vez de
    // "aguardando" depois de um recarregamento. A transcrição que a âncora já tinha **fica**
    // (#253): tentar de novo e dar timeout não pode apagar o que a tentativa anterior trouxe.
    // Falhar ao registrar não troca o erro que a pessoa precisa ver.
    if (error instanceof MathRecognitionError && anchor !== null) {
      await deps.log
        .recordRecognitionFailure(anchor, { error: error.message, at: now() })
        .catch(() => undefined);
    }
    throw error;
  }

  if (anchor !== null) {
    await deps.log.recordRecognition(anchor, {
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
