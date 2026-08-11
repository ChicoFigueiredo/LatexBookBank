import "server-only";

import { escapeIfProse } from "@modules/recognition/domain/latex-escape";
import {
  MathRecognitionError,
  type MathRecognitionProvider,
  type MathRecognitionRequest,
  type MathRecognitionResult,
} from "@/shared/ports";

/**
 * Reconhecimento por modelo multimodal, no mesmo endpoint OpenAI-compatible do agente.
 *
 * Nenhum serviço novo: o `qwen3-coder` que responde no painel e o `gemma3` que enxerga imagem
 * moram no mesmo Ollama. Um provider dedicado de OCR matemático seria mais preciso, e seria
 * também outra dependência, outra chave e outro custo — e a spec pede que a opção local exista,
 * não que ela seja a melhor possível.
 *
 * O **modelo é outro** de propósito: `AI_VISION_MODEL` é separado de `AI_MODEL`, porque o modelo
 * bom de código raramente é o que enxerga.
 *
 * Ver spec §19 · issue #125.
 */

export interface VisionRecognizerConfig {
  readonly baseUrl: string;
  readonly apiKey: string | null;
  readonly model: string;
  readonly timeoutMs?: number;
}

/** Dois minutos: um modelo local de visão frio demora, e cortar antes desperdiça a carga. */
const DEFAULT_TIMEOUT_MS = 120_000;

const PROMPTS: Readonly<Record<MathRecognitionRequest["mode"], string>> = {
  display:
    "Transcreva a fórmula matemática desta imagem em LaTeX. Responda **apenas** com o LaTeX da " +
    "fórmula, sem `$`, sem `\\[`, sem explicação e sem cercas de código.",
  inline:
    "Transcreva a expressão matemática desta imagem em LaTeX, para uso em linha. Responda " +
    "**apenas** com o LaTeX, sem `$` e sem explicação.",
  mixed:
    "Transcreva o conteúdo desta imagem em LaTeX, preservando o texto em português e escrevendo " +
    "as fórmulas entre `$`. Responda **apenas** com a transcrição, sem explicação e sem cercas.",
  // O prompt pede texto **puro**, e não LaTeX: pedir LaTeX aqui faria o modelo inventar marcação
  // onde não há. A tradução para LaTeX acontece no escape, que é determinístico — e determinismo é
  // o que se quer para os dez caracteres que mudam o significado do documento.
  text:
    "Transcreva o texto desta imagem exatamente como está escrito, preservando acentuação e " +
    "pontuação. Responda **apenas** com o texto, sem formatação, sem explicação e sem cercas.",
};

export class VisionMathRecognizer implements MathRecognitionProvider {
  readonly id = "openai-compatible-vision";

  constructor(private readonly config: VisionRecognizerConfig) {}

  async recognize(request: MathRecognitionRequest): Promise<MathRecognitionResult> {
    const started = Date.now();

    const body = {
      model: this.config.model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PROMPTS[request.mode] },
            {
              type: "image_url",
              // Data URI, não URL: o recorte pode nem estar no storage ainda — ele acabou de sair
              // do canvas —, e subir para depois mandar o endereço criaria um asset por tentativa
              // de reconhecimento, incluindo as descartadas.
              image_url: { url: `data:${request.mimeType};base64,${toBase64(request.image)}` },
            },
          ],
        },
      ],
      // Temperatura zero: transcrever não é criar. Variação aqui é erro, não diversidade.
      temperature: 0,
      max_tokens: 1_500,
    };

    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {}),
        },
        body: JSON.stringify(body),
        signal: request.signal ?? AbortSignal.timeout(this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
    } catch (error) {
      throw new MathRecognitionError(
        `Não foi possível falar com ${this.config.baseUrl}.`,
        this.id,
        error,
      );
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new MathRecognitionError(
        `O endpoint recusou: HTTP ${response.status}. ${detail.slice(0, 300)}`.trim(),
        this.id,
      );
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string | null } }[];
    };
    const raw = payload.choices?.[0]?.message?.content ?? "";

    return {
      // `escapeIfProse` só age no modo `text`: os outros já vêm em LaTeX por definição, e escapar
      // `display` transformaria `\frac{1}{2}` em texto literal — o oposto do que se pediu.
      latex: escapeIfProse(cleanLatex(raw), request.mode),
      // O endpoint não devolve confiança, e **inventar um número seria pior que não ter**: a tela
      // trataria um palpite como medida. `null` diz "não sei medir", que é a verdade.
      confidence: null,
      alternatives: [],
      providerId: this.id,
      model: this.config.model,
      durationMs: Date.now() - started,
    };
  }
}

/**
 * Tira o que o modelo acrescenta apesar de instruído a não acrescentar.
 *
 * Cerca de código e `$` delimitador aparecem em quase toda resposta, mesmo com o prompt pedindo
 * o contrário — e deixá-los faria o LaTeX candidato não compilar por um motivo que não é do
 * usuário. Limpar aqui é mais honesto que repetir a instrução em maiúsculas.
 */
export function cleanLatex(raw: string): string {
  let text = raw.trim();

  // Cerca de código, com ou sem linguagem.
  const fence = /^```(?:latex|tex)?\s*\n([\s\S]*?)\n?```$/;
  const fenced = fence.exec(text);
  if (fenced?.[1] !== undefined) text = fenced[1].trim();

  // Delimitadores de display e inline, quando envolvem a resposta inteira.
  for (const [open, close] of [
    ["\\[", "\\]"],
    ["$$", "$$"],
    ["\\(", "\\)"],
  ] as const) {
    if (text.startsWith(open) && text.endsWith(close)) {
      text = text.slice(open.length, text.length - close.length).trim();
    }
  }

  // `$…$` só quando não há outro `$` no meio: `$a$ e $b$` é conteúdo misto, e tirar as pontas
  // deixaria `a$ e $b`, que é pior que o original.
  if (text.startsWith("$") && text.endsWith("$") && text.slice(1, -1).indexOf("$") === -1) {
    text = text.slice(1, -1).trim();
  }

  return text;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  // Em blocos: `String.fromCharCode(...bytes)` estoura a pilha com imagem de alguns megabytes.
  const CHUNK = 8_192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
