import { DIFFICULTIES, isDifficulty, type Difficulty } from "./question-type";

/**
 * Os metadados de uma questão: de onde veio, quem cobrou, quando.
 *
 * São campos de texto livre quase todos — banca, instituição, cargo — e é assim de propósito. O
 * acervo tem vinte anos de bancas com nomes que mudaram ("CESPE" virou "CEBRASPE"), e um
 * vocabulário fechado obrigaria a escolher qual nome está certo antes de o dado existir. O que
 * este arquivo faz é normalizar e recusar o que é claramente errado, não impor taxonomia.
 */

export interface QuestionMetadata {
  readonly difficulty: Difficulty;
  readonly year: number | null;
  readonly board: string | null;
  readonly institution: string | null;
  readonly role: string | null;
  readonly roleLevel: string | null;
  readonly publisher: string | null;
  readonly videoUrl: string | null;
}

export interface MetadataIssue {
  readonly field: keyof QuestionMetadata;
  readonly message: string;
}

/**
 * A faixa de anos aceita.
 *
 * O piso é 1900 porque o acervo tem questões de provas históricas transcritas, e um piso mais
 * alto as recusaria. O teto é o ano seguinte ao corrente: prova de vestibular de janeiro é
 * cadastrada em novembro, e recusar isso seria brigar com o calendário de quem usa.
 */
export const MIN_YEAR = 1900;
export const maxYear = (now: Date): number => now.getFullYear() + 1;

/** Texto livre: espaços colapsados, vazio vira `null`. */
export function normalizeText(raw: string | null | undefined, maxLength = 200): string | null {
  const value = (raw ?? "").replace(/\s+/g, " ").trim();
  if (value === "") return null;
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

/**
 * URL de vídeo.
 *
 * Aceita só `http`/`https`. Não é purismo: `javascript:` num campo que a interface transforma em
 * link é XSS armazenado, e o campo aceita colagem de qualquer lugar. A checagem fica no domínio
 * porque a regra é do dado, não da tela — e a tela é só um dos consumidores.
 */
export function normalizeVideoUrl(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (value === "") return null;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new MetadataError("videoUrl", "O endereço do vídeo não é uma URL válida.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new MetadataError(
      "videoUrl",
      `Só endereços \`http\` ou \`https\` são aceitos — \`${parsed.protocol}\` não.`,
    );
  }
  return parsed.toString();
}

export class MetadataError extends Error {
  constructor(
    readonly field: keyof QuestionMetadata,
    message: string,
  ) {
    super(message);
    this.name = "MetadataError";
  }
}

export interface MetadataInput {
  readonly difficulty?: number;
  readonly year?: number | null;
  readonly board?: string | null;
  readonly institution?: string | null;
  readonly role?: string | null;
  readonly roleLevel?: string | null;
  readonly publisher?: string | null;
  readonly videoUrl?: string | null;
}

/**
 * Normaliza a entrada, ou recusa.
 *
 * Recusa em vez de corrigir em silêncio: ano `20244` é erro de digitação, e gravar `2024` seria
 * adivinhar. O que é corrigido sem avisar é só o que não muda significado — espaço duplicado,
 * pontas em branco.
 */
export function normalizeMetadata(
  input: MetadataInput,
  now: Date = new Date(),
): Partial<QuestionMetadata> {
  const result: Record<string, unknown> = {};

  if (input.difficulty !== undefined) {
    if (!isDifficulty(input.difficulty)) {
      // A escala legada é 0 · 2 · 5 · 7 · 10, e **não** 1–5. Mapear para 1–5 perderia a
      // granularidade que o acervo já usa e tornaria o import não reversível (D-legado).
      throw new MetadataError(
        "difficulty",
        `Dificuldade precisa ser uma de ${DIFFICULTIES.join(", ")} — a escala do acervo.`,
      );
    }
    result["difficulty"] = input.difficulty;
  }

  if (input.year !== undefined) {
    if (input.year === null) {
      result["year"] = null;
    } else if (
      !Number.isInteger(input.year) ||
      input.year < MIN_YEAR ||
      input.year > maxYear(now)
    ) {
      throw new MetadataError("year", `Ano precisa estar entre ${MIN_YEAR} e ${maxYear(now)}.`);
    } else {
      result["year"] = input.year;
    }
  }

  for (const field of ["board", "institution", "role", "roleLevel", "publisher"] as const) {
    if (input[field] !== undefined) result[field] = normalizeText(input[field]);
  }

  if (input.videoUrl !== undefined) result["videoUrl"] = normalizeVideoUrl(input.videoUrl);

  return result as Partial<QuestionMetadata>;
}

/**
 * Avisos — o que provavelmente está incompleto, sem impedir nada.
 *
 * Separado da normalização de propósito: normalizar recusa, avisar informa. Uma questão sem banca
 * é utilizável; uma questão com ano `20244` não é dado, é erro de digitação.
 */
export function metadataWarnings(metadata: QuestionMetadata): readonly MetadataIssue[] {
  const issues: MetadataIssue[] = [];

  if (metadata.year !== null && metadata.board === null) {
    issues.push({
      field: "board",
      message: "A questão tem ano mas não tem banca — o par é o que permite filtrar por prova.",
    });
  }

  return issues;
}
