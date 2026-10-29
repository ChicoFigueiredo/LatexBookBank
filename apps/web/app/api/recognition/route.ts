import { NextResponse } from "next/server";

import {
  recognizeCrop,
  type RecognitionMode,
} from "@modules/recognition/application/recognize-crop";
import type { RecognitionCandidate } from "@modules/recognition/domain/recognition-review";
import {
  recordRecognition,
  recordRecognitionFailure,
} from "@modules/recognition/infrastructure/prisma-capture-queue";
import { visionRecognizer } from "@infrastructure/composition";
import { env as appEnv, visionConfigured } from "@/shared/config/env";
import { MathRecognitionError } from "@/shared/ports";

import { BadRequestError, toErrorResponse } from "../http";

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
    if (!visionConfigured(appEnv())) {
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
    const anchorId = typeof rawAnchor === "string" && rawAnchor !== "" ? rawAnchor : null;

    // Falha do provider **não perde trabalho**: o recorte segue guardado, a falha fica na âncora,
    // e o 502 `recognition_failed` diz o que houve para a pessoa decidir entre tentar de novo e
    // transcrever à mão. O reconhecedor é montado dentro do caso de uso (ARQ-07): um OpenRouter
    // sem chave recusa ali, com a instrução de configuração, e cai no mesmo caminho de falha.
    const candidate = await recognizeCrop(
      {
        recognizer: () => {
          const vision = visionRecognizer();
          if (vision === null) {
            throw new MathRecognitionError("A visão deixou de estar configurada.", "composition");
          }
          return vision.recognizer;
        },
        log: { recordRecognition, recordRecognitionFailure },
      },
      {
        cropAssetId,
        anchorId,
        image: new Uint8Array(await image.arrayBuffer()),
        mimeType: image.type || "image/png",
        mode: mode as RecognitionMode,
      },
    );

    return NextResponse.json(candidate satisfies RecognitionCandidate);
  } catch (error) {
    return toErrorResponse(error);
  }
}
