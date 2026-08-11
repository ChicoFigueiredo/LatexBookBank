import { NextResponse } from "next/server";

import { FAILED_METHOD } from "@modules/recognition/domain/capture-queue";
import { candidateFrom } from "@modules/recognition/domain/recognition-review";
import { recordRecognition } from "@modules/recognition/infrastructure/prisma-capture-queue";
import { VisionMathRecognizer } from "@modules/recognition/infrastructure/vision-math-recognizer";
import { env as appEnv } from "@/shared/config/env";
import { MathRecognitionError } from "@/shared/ports";

import { BadRequestError, toErrorResponse } from "../tree-http";

/**
 * Reconhece a matemática de um recorte.
 *
 * Devolve um **candidato**, nunca um valor aplicado: a resposta carrega o estado `candidate`, e
 * o único caminho até `accepted` passa pela revisão humana (spec §19).
 *
 * A imagem vem no corpo e o `cropAssetId` junto — o recorte já está guardado, e é ele que fica
 * ao lado do candidato na tela. Falha aqui não perde nada: o crop continua no storage e a
 * tentativa pode ser repetida.
 *
 * Ver spec §19 · issue #125.
 */
export const dynamic = "force-dynamic";

const MODES = new Set(["display", "inline", "mixed", "text"]);

export async function POST(request: Request) {
  // Fora do `try` porque o `catch` precisa dela para registrar a falha na âncora.
  let anchorId: string | null = null;

  try {
    const env = appEnv();

    const model = process.env["AI_VISION_MODEL"] ?? null;
    if (env.aiBaseUrl === null || model === null) {
      // Modelo de visão é outro: o bom de código raramente enxerga. Sem ele configurado, dizer o
      // que falta é melhor que tentar com o modelo de texto e devolver algo sem sentido.
      return NextResponse.json(
        {
          error: "vision_not_configured",
          message: "Defina `AI_BASE_URL` e `AI_VISION_MODEL` em `apps/web/.env.local`.",
        },
        { status: 503 },
      );
    }

    const form = await request.formData().catch(() => null);
    if (form === null) throw new BadRequestError("Envie como `multipart/form-data`.");

    const image = form.get("image");
    if (!(image instanceof File)) throw new BadRequestError("O campo `image` é obrigatório.");

    const cropAssetId = form.get("cropAssetId");
    if (typeof cropAssetId !== "string" || cropAssetId === "") {
      throw new BadRequestError("O campo `cropAssetId` é obrigatório — o recorte fica com ele.");
    }

    const rawMode = form.get("mode");
    const mode = typeof rawMode === "string" && MODES.has(rawMode) ? rawMode : "display";

    /**
     * A âncora, quando o cliente a manda.
     *
     * É o que faz o resultado **sobreviver ao recarregamento** (§26, §53). Sem ela, reconhecer dez
     * recortes e fechar a aba perderia as dez transcrições, e cada recorte voltaria para
     * "aguardando" como se nada tivesse rodado.
     *
     * Opcional porque reconhecer um recorte que ainda não foi salvo é caso legítimo — e porque a
     * gravação aqui **não aprova nada**: a questão só nasce pelo caminho que exige revisão.
     */
    const rawAnchor = form.get("anchorId");
    anchorId = typeof rawAnchor === "string" && rawAnchor !== "" ? rawAnchor : null;

    const recognizer = new VisionMathRecognizer({
      baseUrl: env.aiBaseUrl,
      apiKey: env.aiApiKey,
      model,
    });

    const result = await recognizer.recognize({
      image: new Uint8Array(await image.arrayBuffer()),
      mimeType: image.type || "image/png",
      mode: mode as "display" | "inline" | "mixed" | "text",
    });

    if (anchorId !== null) {
      await recordRecognition(anchorId, {
        latex: result.latex,
        method: `recognition:${result.providerId}`,
        model: result.model,
        metadataJson: JSON.stringify({
          mode,
          durationMs: result.durationMs,
          confidence: result.confidence,
          recognizedAt: new Date().toISOString(),
        }),
      });
    }

    return NextResponse.json(candidateFrom(cropAssetId, result));
  } catch (error) {
    if (error instanceof MathRecognitionError) {
      // Falha do provider **não perde trabalho**: o recorte segue guardado, e a mensagem diz o
      // que houve para a pessoa decidir entre tentar de novo e transcrever à mão.
      //
      // A falha fica **registrada na âncora**, e é o que faz a fila mostrar "erro" em vez de
      // "aguardando" depois de um recarregamento — a diferença entre "ainda não tentei" e
      // "tentei e não deu".
      if (anchorId !== null) {
        await recordRecognition(anchorId, {
          latex: "",
          method: FAILED_METHOD,
          model: null,
          metadataJson: JSON.stringify({ error: error.message, at: new Date().toISOString() }),
        }).catch(() => undefined);
      }

      return NextResponse.json(
        { error: "recognition_failed", message: error.message },
        { status: 502 },
      );
    }
    return toErrorResponse(error);
  }
}
