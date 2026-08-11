import { NextResponse } from "next/server";

import { candidateFrom } from "@modules/recognition/domain/recognition-review";
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

    return NextResponse.json(candidateFrom(cropAssetId, result));
  } catch (error) {
    if (error instanceof MathRecognitionError) {
      // Falha do provider **não perde trabalho**: o recorte segue guardado, e a mensagem diz o
      // que houve para a pessoa decidir entre tentar de novo e transcrever à mão.
      return NextResponse.json(
        { error: "recognition_failed", message: error.message },
        { status: 502 },
      );
    }
    return toErrorResponse(error);
  }
}
