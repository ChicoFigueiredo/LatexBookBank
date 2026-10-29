import { afterEach, describe, expect, it, vi } from "vitest";

import { OpenAiCompatibleProvider } from "@infrastructure/ai/openai-compatible/openai-compatible-provider";
import { VisionMathRecognizer } from "@modules/recognition/infrastructure/vision-math-recognizer";
import { AiCredentialMissingError, MathRecognitionError } from "@/shared/ports";

/**
 * O reconhecedor por visão contra o endpoint OpenAI-compatible, com respostas gravadas (ARQ-07).
 *
 * O que se prova é o que sai pelo fio e o que volta para a tela: o prompt do modo, a imagem como
 * data URI, temperatura zero, a limpeza da resposta, o escape da prosa e a falha do endpoint como
 * `MathRecognitionError` — a única que a rota de reconhecimento traduz em "o recorte continua
 * guardado, tente de novo". É a rede para o reconhecedor deixar de ter cliente HTTP próprio.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(content: string | null, init: { status?: number; body?: string } = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, requestInit: RequestInit) => {
      calls.push({ url, init: requestInit });
      return Promise.resolve(
        new Response(
          init.body ??
            JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }] }),
          { status: init.status ?? 200, headers: { "content-type": "application/json" } },
        ),
      );
    }),
  );
  return calls;
}

const OLLAMA = { baseUrl: "http://127.0.0.1:11434/v1/", apiKey: null };
const OPENROUTER = { baseUrl: "https://openrouter.ai/api/v1", apiKey: "sk-or-teste" };

const recognizer = (endpoint: { baseUrl: string; apiKey: string | null }, model = "gemma3:12b") =>
  new VisionMathRecognizer(new OpenAiCompatibleProvider(endpoint), model);

const PNG = new Uint8Array([137, 80, 78, 71]);

describe("VisionMathRecognizer", () => {
  it("manda o prompt do modo e o recorte como data URI, com temperatura zero", async () => {
    const calls = stubFetch("```latex\n\\frac{1}{2}\n```");

    const result = await recognizer(OPENROUTER).recognize({
      image: PNG,
      mimeType: "image/png",
      mode: "display",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    const headers = new Headers(calls[0]?.init.headers);
    expect(headers.get("authorization")).toBe("Bearer sk-or-teste");

    const body = JSON.parse(String(calls[0]?.init.body)) as {
      model: string;
      temperature: number;
      max_tokens: number;
      messages: {
        role: string;
        content: { type: string; text?: string; image_url?: { url: string } }[];
      }[];
    };
    expect(body.model).toBe("gemma3:12b");
    expect(body.temperature).toBe(0);
    expect(body.max_tokens).toBe(1_500);
    expect(body.messages).toHaveLength(1);
    const [text, image] = body.messages[0]!.content;
    expect(body.messages[0]?.role).toBe("user");
    expect(text?.type).toBe("text");
    expect(text?.text).toMatch(/fórmula matemática desta imagem em LaTeX/);
    expect(image).toEqual({
      type: "image_url",
      image_url: { url: "data:image/png;base64,iVBORw==" },
    });

    // A cerca que o modelo acrescenta apesar de instruído sai; o resto é o candidato.
    expect(result).toMatchObject({
      latex: "\\frac{1}{2}",
      confidence: null,
      alternatives: [],
      providerId: "openai-compatible-vision",
      model: "gemma3:12b",
    });
  });

  it("no modo texto, a prosa sai escapada: o % não comenta o resto da linha", async () => {
    stubFetch("Rendeu 5% ao mês & mais");

    const result = await recognizer(OLLAMA).recognize({
      image: PNG,
      mimeType: "image/png",
      mode: "text",
    });

    expect(result.latex).toBe("Rendeu 5\\% ao mês \\& mais");
  });

  it("o endpoint que recusa vira MathRecognitionError, com o status na mensagem", async () => {
    stubFetch(null, { status: 503, body: "modelo carregando" });

    const failure = recognizer(OLLAMA).recognize({
      image: PNG,
      mimeType: "image/png",
      mode: "inline",
    });

    await expect(failure).rejects.toBeInstanceOf(MathRecognitionError);
    await expect(failure).rejects.toThrow(/HTTP 503/);
  });

  it("OpenRouter sem chave recusa antes de qualquer recorte, com a instrução do agente", () => {
    const fetch = stubFetch("nunca chamado");

    expect(() => recognizer({ ...OPENROUTER, apiKey: null })).toThrow(AiCredentialMissingError);
    expect(() => recognizer({ ...OPENROUTER, apiKey: null })).toThrow(/AI_API_KEY/);
    expect(fetch).toHaveLength(0);
  });

  it("endpoint sem rede vira MathRecognitionError, não exceção crua", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("fetch failed"))),
    );

    await expect(
      recognizer(OLLAMA).recognize({ image: PNG, mimeType: "image/png", mode: "mixed" }),
    ).rejects.toBeInstanceOf(MathRecognitionError);
  });
});
