import "server-only";

import type { env as appEnv } from "@/shared/config/env";
import { OpenAiCompatibleProvider } from "@modules/agents/infrastructure/openai-compatible-provider";
import { VisionMathRecognizer } from "@modules/recognition/infrastructure/vision-math-recognizer";
import type { MathPass, SemanticPass } from "@modules/scan/application/run-scan";
import { createMathPass } from "@modules/scan/application/math-recognition";
import { createSemanticPass } from "@modules/scan/application/semantic-review";

type Env = ReturnType<typeof appEnv>;

/**
 * A IA do scan vem do mesmo ambiente do agente e da captura (D3): qualquer endpoint
 * OpenAI-compatible — Ollama, vLLM, LM Studio, OpenRouter. Sem configuração, as passadas não
 * existem e o scan é só determinístico; nada aqui depende de internet.
 */

export function semanticPassFromEnv(env: Env): SemanticPass | null {
  if (!env.aiBaseUrl || !env.aiModel) return null;
  try {
    const provider = new OpenAiCompatibleProvider({ baseUrl: env.aiBaseUrl, apiKey: env.aiApiKey });
    return createSemanticPass(provider, env.aiModel);
  } catch {
    // Configuração incompleta (endpoint que exige chave, sem chave): sem desempate, sem falha.
    return null;
  }
}

export function mathPassFromEnv(env: Env): MathPass | null {
  const model = process.env["AI_VISION_MODEL"] ?? null;
  if (!env.aiBaseUrl || !model) return null;
  return createMathPass(
    new VisionMathRecognizer({ baseUrl: env.aiBaseUrl, apiKey: env.aiApiKey, model }),
    model,
  );
}
