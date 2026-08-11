import "server-only";

import { profileForBaseUrl } from "../domain/ai-profile";
import type { AiSetupDescription } from "../domain/ai-setup";
import { env } from "@/shared/config/env";

/**
 * O que a tela precisa saber sobre a IA configurada — e **nada além disso**.
 *
 * Existe para que o Server Component possa dizer ao painel "Ollama local · qwen3-coder:30b" sem
 * que a chave chegue perto da fronteira do cliente. O que atravessa são dois rótulos; o segredo
 * fica deste lado, e o teste de fronteira prova que fica.
 *
 * O **tipo** mora no domínio, e não aqui: um Client Component precisa dele para tipar a prop, e
 * se ele morasse neste arquivo o `import type` arrastaria o cliente até um módulo `server-only`.
 * Some no build por ser só tipo — mas passa a depender de erasure para não vazar, e o teste de
 * fronteira recusa essa aposta. Foi ele que apontou o erro.
 *
 * Ver spec §14.6 · issue #93.
 */

/** `null` quando não há IA configurada — o painel diz o que falta em vez de sumir. */
export function describeAiSetup(): AiSetupDescription | null {
  const { aiBaseUrl, aiModel } = env();
  if (!aiBaseUrl) return null;

  const profile = profileForBaseUrl(aiBaseUrl);

  return {
    providerLabel: profile.label,
    model: aiModel,
    toolCalling: profile.assumedCapabilities.toolCalling,
  };
}
