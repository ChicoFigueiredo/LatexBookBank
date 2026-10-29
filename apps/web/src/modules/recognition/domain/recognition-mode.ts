import type { MathRecognitionRequest } from "@/shared/ports";

/**
 * O que se espera do recorte: uma fórmula solta, uma fórmula no meio da linha, texto com fórmula,
 * ou só prosa. O tipo é o da porta (`MathRecognitionRequest["mode"]`); a lista e o guarda moram
 * aqui, para a borda conferir o que chega em vez de repetir a lista e confiar num `as`.
 */
export type RecognitionMode = MathRecognitionRequest["mode"];

export const RECOGNITION_MODES = [
  "display",
  "inline",
  "mixed",
  "text",
] as const satisfies readonly RecognitionMode[];

// Um modo novo na porta, e esquecido aqui, não compila.
const everyModeListed: [Exclude<RecognitionMode, (typeof RECOGNITION_MODES)[number]>] extends [
  never,
]
  ? true
  : never = true;
void everyModeListed;

export const isRecognitionMode = (value: unknown): value is RecognitionMode =>
  typeof value === "string" && (RECOGNITION_MODES as readonly string[]).includes(value);
