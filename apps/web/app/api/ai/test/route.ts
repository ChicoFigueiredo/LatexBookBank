import { NextResponse } from "next/server";

import { OpenAiCompatibleProvider } from "@modules/agents/infrastructure/openai-compatible-provider";
import { env as appEnv } from "@/shared/config/env";
import { AiCredentialMissingError, AiProviderError } from "@/shared/ports";

import { toErrorResponse } from "../../tree-http";

/**
 * "Testar conexão" — a única coisa que faltava da Fase 8.
 *
 * Lista os modelos em vez de mandar uma pergunta: listar é barato, não gasta token e responde a
 * dúvida real, que é "o endereço e a chave estão certos?". Uma pergunta de teste custaria dinheiro
 * em endpoint pago e um minuto de espera em modelo local frio — para dizer a mesma coisa.
 *
 * A resposta diz **se o modelo configurado está na lista**. Endereço certo com modelo inexistente
 * é o erro mais comum, e ele só aparece na primeira pergunta de verdade se ninguém conferir aqui.
 *
 * Ver spec §25 · issue #119.
 */
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const env = appEnv();

    if (env.aiBaseUrl === null) {
      return NextResponse.json(
        { ok: false, message: "`AI_BASE_URL` não está definido em `apps/web/.env.local`." },
        { status: 503 },
      );
    }

    const provider = new OpenAiCompatibleProvider({
      baseUrl: env.aiBaseUrl,
      apiKey: env.aiApiKey,
      // Curto de propósito: testar conexão que demora um minuto não é teste, é espera.
      timeoutMs: 10_000,
    });

    const models = await provider.listModels();
    const names = models.map((model) => model.id);

    if (names.length === 0) {
      // Endpoint sem rota de listagem — legítimo. Chegar até aqui já provou que ele responde.
      return NextResponse.json({
        ok: true,
        message: "O endereço respondeu, mas este endpoint não lista modelos.",
        models: [],
      });
    }

    const configured = env.aiModel;
    const found = configured !== null && names.includes(configured);

    return NextResponse.json({
      ok: found || configured === null,
      message:
        configured === null
          ? `Conectado. ${names.length} modelo(s) disponíveis — falta definir \`AI_MODEL\`.`
          : found
            ? `Conectado. \`${configured}\` está disponível.`
            : `Conectado, mas \`${configured}\` **não** está na lista de ${names.length} modelo(s).`,
      models: names.slice(0, 40),
    });
  } catch (error) {
    if (error instanceof AiCredentialMissingError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 503 });
    }
    if (error instanceof AiProviderError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 502 });
    }
    return toErrorResponse(error);
  }
}
