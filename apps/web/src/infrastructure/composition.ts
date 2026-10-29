import "server-only";

import { capabilitiesFor } from "@modules/agents/domain/ai-profile";
import { VisionMathRecognizer } from "@modules/recognition/infrastructure/vision-math-recognizer";
import { env as appEnv } from "@/shared/config/env";
import type { MathRecognitionProvider, StorageProvider } from "@/shared/ports";

import { OpenAiCompatibleProvider } from "./ai/openai-compatible/openai-compatible-provider";
import { LocalFileStorageProvider } from "./storage/local/local-file-storage-provider";

/**
 * A raiz de composição: qual implementação atende cada porta, decidido pelo ambiente.
 *
 * Storage, IA e visão eram montados à mão em dezenove lugares — doze `new LocalFileStorageProvider`
 * em quatro módulos —, e trocar o storage para um bucket (a Fase 6.5 do plano) exigiria achar
 * todos. A rota esquecida gravaria no disco efêmero do servidor, e o sintoma seria "asset não
 * encontrado" só nela (STE-08, ARQ-03).
 *
 * Não é container de injeção nem service locator: são fábricas, uma por porta, lendo de `env()`.
 * Quem chama recebe a **porta**, e não a classe concreta. O render tem a sua em
 * `rendering/infrastructure/render-wiring.ts`, que guarda o executor do processo e usa o storage
 * daqui; o scan, em `scan/infrastructure/scan-deps.ts`.
 *
 * Um teste de fronteira (`tests/composition-root.test.ts`) recusa `new` destas classes fora daqui.
 */

/** O storage dos arquivos do acervo. Hoje o disco local; o bucket entra trocando esta função. */
export function storage(): StorageProvider {
  return new LocalFileStorageProvider({ rootDir: appEnv().storageRoot });
}

/**
 * O endpoint de IA configurado, ou `null` quando não há nenhum.
 *
 * `null` e não exceção: o app inteiro funciona sem IA, e quem chama decide o que dizer. O tool
 * calling é o mesmo que o `/diagnostico` mostra: `AI_TOOL_CALLING=true` liga o que o perfil do
 * endpoint não assume. Pode lançar `AiCredentialMissingError` — endpoint que exige chave, sem
 * chave —, que o tradutor de erros transforma em 503.
 */
export function aiProvider(
  options: { readonly timeoutMs?: number } = {},
): OpenAiCompatibleProvider | null {
  const { aiBaseUrl, aiApiKey, aiModel, aiToolCalling } = appEnv();
  if (aiBaseUrl === null) return null;

  return new OpenAiCompatibleProvider({
    baseUrl: aiBaseUrl,
    apiKey: aiApiKey,
    capabilities: capabilitiesFor(aiBaseUrl, { toolCalling: aiToolCalling }),
    ...(aiModel === null ? {} : { defaultModel: aiModel }),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  });
}

/**
 * O reconhecedor de matemática e o modelo que ele usa, ou `null` sem visão configurada.
 *
 * O critério é o de `visionConfigured`, o mesmo que a tela usa para oferecer o botão. O provider é
 * o mesmo cliente do agente (ARQ-07): a visão é outro modelo no mesmo endpoint. Como `aiProvider`,
 * pode lançar `AiCredentialMissingError` — e quem chama decide se isso é "sem matemática" (o scan)
 * ou uma falha registrada na âncora (a captura).
 */
export function visionRecognizer(): {
  readonly recognizer: MathRecognitionProvider;
  readonly model: string;
} | null {
  const { aiBaseUrl, aiApiKey, aiVisionModel } = appEnv();
  if (aiBaseUrl === null || aiVisionModel === null) return null;

  return {
    recognizer: new VisionMathRecognizer(
      new OpenAiCompatibleProvider({ baseUrl: aiBaseUrl, apiKey: aiApiKey }),
      aiVisionModel,
    ),
    model: aiVisionModel,
  };
}
