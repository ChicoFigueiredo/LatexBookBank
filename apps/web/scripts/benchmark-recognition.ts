import { readFile } from "node:fs/promises";

/**
 * Roda o reconhecimento de verdade contra recortes reais e imprime o LaTeX bruto, para comparar
 * a olho contra a imagem — não há gabarito automático possível aqui, quem compara é uma pessoa.
 *
 *     bun run scripts/benchmark-recognition.ts recorte1.png recorte2.png ...
 *
 * Réplica mínima de `VisionMathRecognizer.recognize`, e não import direto: aquele arquivo é
 * `server-only` de propósito — evita que uma chave de provider vaze para um bundle de cliente —,
 * e um script de linha de comando não é um Server Component. Mesmo motivo de
 * `PrismaLatexKnowledgeRepository`.
 *
 * Ver docs/_atual/recognition-benchmark.md · issue #125.
 */

// Mantido em sincronia à mão com `PROMPTS.mixed` de `vision-math-recognizer.ts` — duplicado pelo
// mesmo motivo do resto deste arquivo, não copiado por descuido.
const PROMPT_MIXED =
  "Transcreva o conteúdo desta imagem em LaTeX, preservando o texto em português e escrevendo " +
  "as fórmulas entre `$`. Responda **apenas** com a transcrição, sem explicação e sem cercas. " +
  "Se a fórmula tiver termos repetidos com reticências (somas ou frações do tipo " +
  '"a + b + ... + z"), confira cada dígito e cada sinal antes de responder — é onde erros ' +
  "acontecem. Se a imagem parecer cortada ou incompleta, transcreva só o que está visível: nunca " +
  "complete o padrão com conteúdo que não está na imagem.";

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 8_192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function recognize(
  image: Uint8Array,
  baseUrl: string,
  model: string,
): Promise<{ latex: string; durationMs: number }> {
  const started = Date.now();
  const body = {
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: PROMPT_MIXED },
          { type: "image_url", image_url: { url: `data:image/png;base64,${toBase64(image)}` } },
        ],
      },
    ],
    temperature: 0,
    max_tokens: 1_500,
  };

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }

  const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  return { latex: (payload.choices?.[0]?.message?.content ?? "").trim(), durationMs: Date.now() - started };
}

async function main(): Promise<void> {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error("Uso: bun run scripts/benchmark-recognition.ts recorte1.png [recorte2.png ...]");
    process.exitCode = 1;
    return;
  }

  const baseUrl = process.env["AI_BASE_URL"] ?? "http://127.0.0.1:11434/v1";
  const model = process.env["AI_VISION_MODEL"] ?? "gemma3:12b";

  for (const file of files) {
    const image = new Uint8Array(await readFile(file));
    console.log(`\n=== ${file} ===`);
    try {
      const result = await recognize(image, baseUrl, model);
      console.log(`(${result.durationMs}ms)`);
      console.log(result.latex);
    } catch (error) {
      console.log("ERRO:", error);
    }
  }
}

await main();
