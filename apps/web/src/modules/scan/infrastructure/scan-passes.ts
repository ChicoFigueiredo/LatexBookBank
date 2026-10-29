import "server-only";

import { aiProvider, visionRecognizer } from "@infrastructure/composition";
import type { MathPass, SemanticPass } from "@modules/scan/application/run-scan";
import { createMathPass } from "@modules/scan/application/math-recognition";
import { createSemanticPass } from "@modules/scan/application/semantic-review";
import { env as appEnv } from "@/shared/config/env";

/**
 * A IA do scan vem do mesmo ambiente do agente e da captura (D3): qualquer endpoint
 * OpenAI-compatible — Ollama, vLLM, LM Studio, OpenRouter. Sem configuração, as passadas não
 * existem e o scan é só determinístico; nada aqui depende de internet.
 *
 * As peças vêm da raiz de composição: o critério de "visão configurada" é o mesmo da tela que
 * oferece "Reconhecer matemática", e não uma quarta cópia dele.
 */

export function semanticPassFromEnv(): SemanticPass | null {
  const model = appEnv().aiModel;
  if (model === null) return null;
  try {
    const provider = aiProvider();
    return provider === null ? null : createSemanticPass(provider, model);
  } catch {
    // Configuração incompleta (endpoint que exige chave, sem chave): sem desempate, sem falha.
    return null;
  }
}

export function mathPassFromEnv(): MathPass | null {
  const vision = visionRecognizer();
  return vision === null ? null : createMathPass(vision.recognizer, vision.model);
}
