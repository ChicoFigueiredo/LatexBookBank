import "server-only";

import { escapeIfProse } from "@modules/latex/domain/latex-escape";
import {
  AiProviderError,
  MathRecognitionError,
  type AiProvider,
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
 * O **cliente é o mesmo** (ARQ-07): este arquivo fica com o prompt, a limpeza e o escape, e fala
 * com o endpoint pelo `AiProvider` que recebe — o `OpenAiCompatibleProvider` do agente. Perfil,
 * credencial, prazo e erro têm um dono só: um OpenRouter sem chave recusa aqui com a mesma
 * instrução que o agente dá, e não com um 401 a cada recorte.
 *
 * Ver spec §19 · issue #125.
 */

/**
 * O aviso sobre repetição e corte é comum aos três modos matemáticos — é onde
 * `docs/_atual/recognition-benchmark.md` achou erro de verdade contra o `gemma3:12b`: dígito
 * truncado e sinal trocado sempre numa soma ou fração repetida com "...", e conteúdo inventado
 * quando o recorte vem cortado antes do fim. O modelo nunca vai dizer sozinho "isto está
 * incompleto" — só o prompt pode pedir isso.
 */
const AVISO_REPETICAO_E_CORTE =
  "Se a fórmula tiver termos repetidos com reticências (somas ou frações do tipo " +
  "\"a + b + ... + z\"), confira cada dígito e cada sinal antes de responder — é onde erros " +
  "acontecem. Se a imagem parecer cortada ou incompleta, transcreva só o que está visível: nunca " +
  "complete o padrão com conteúdo que não está na imagem.";

const PROMPTS: Readonly<Record<MathRecognitionRequest["mode"], string>> = {
  display:
    "Transcreva a fórmula matemática desta imagem em LaTeX. Responda **apenas** com o LaTeX da " +
    `fórmula, sem \`$\`, sem \`\\[\`, sem explicação e sem cercas de código. ${AVISO_REPETICAO_E_CORTE}`,
  inline:
    "Transcreva a expressão matemática desta imagem em LaTeX, para uso em linha. Responda " +
    `**apenas** com o LaTeX, sem \`$\` e sem explicação. ${AVISO_REPETICAO_E_CORTE}`,
  mixed:
    "Transcreva o conteúdo desta imagem em LaTeX, preservando o texto em português e escrevendo " +
    "as fórmulas entre `$`. Responda **apenas** com a transcrição, sem explicação e sem cercas. " +
    AVISO_REPETICAO_E_CORTE,
  // O prompt pede texto **puro**, e não LaTeX: pedir LaTeX aqui faria o modelo inventar marcação
  // onde não há. A tradução para LaTeX acontece no escape, que é determinístico — e determinismo é
  // o que se quer para os dez caracteres que mudam o significado do documento.
  text:
    "Transcreva o texto desta imagem exatamente como está escrito, preservando acentuação e " +
    "pontuação. Responda **apenas** com o texto, sem formatação, sem explicação e sem cercas.",
};

export class VisionMathRecognizer implements MathRecognitionProvider {
  readonly id = "openai-compatible-vision";

  constructor(
    private readonly provider: AiProvider,
    private readonly model: string,
  ) {}

  async recognize(request: MathRecognitionRequest): Promise<MathRecognitionResult> {
    const started = Date.now();

    let raw: string;
    try {
      const result = await this.provider.run({
        model: this.model,
        messages: [
          {
            role: "user",
            content: PROMPTS[request.mode],
            images: [{ mimeType: request.mimeType, data: request.image }],
          },
        ],
        // Temperatura zero: transcrever não é criar. Variação aqui é erro, não diversidade.
        temperature: 0,
        maxTokens: 1_500,
        ...(request.signal ? { signal: request.signal } : {}),
      });
      raw = result.text;
    } catch (error) {
      // A falha do endpoint chega como a do reconhecimento: é ela que a rota traduz em "o
      // recorte continua guardado, tente de novo", e a mensagem do provider já diz o que houve.
      if (error instanceof AiProviderError) {
        throw new MathRecognitionError(error.message, this.id, error);
      }
      throw error;
    }

    return {
      // `escapeIfProse` só age no modo `text`: os outros já vêm em LaTeX por definição, e escapar
      // `display` transformaria `\frac{1}{2}` em texto literal — o oposto do que se pediu.
      latex: escapeIfProse(cleanLatex(raw), request.mode),
      // O endpoint não devolve confiança, e **inventar um número seria pior que não ter**: a tela
      // trataria um palpite como medida. `null` diz "não sei medir", que é a verdade.
      confidence: null,
      alternatives: [],
      providerId: this.id,
      model: this.model,
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
