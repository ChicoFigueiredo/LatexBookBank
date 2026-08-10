/**
 * O que pode entrar como asset, e com que nome.
 *
 * Duas checagens que parecem redundantes e não são: o MIME declarado e a extensão do arquivo. O
 * navegador manda o MIME que o sistema operacional associou à extensão — se elas discordam, ou o
 * arquivo foi renomeado, ou é outra coisa. Aceitar mesmo assim guardaria um executável com nome
 * de imagem, e o sistema passaria a servi-lo como imagem.
 *
 * Ver spec §10 · D29 · issue #121.
 */

export interface UploadCandidate {
  readonly filename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
}

export class UploadRejectedError extends Error {
  constructor(
    readonly reason: "mime" | "extension" | "mismatch" | "size" | "empty",
    message: string,
  ) {
    super(message);
    this.name = "UploadRejectedError";
  }
}

/**
 * O que se aceita — lista fechada, por MIME, com as extensões de cada um.
 *
 * Fechada e não "tudo menos": uma lista de proibidos precisa prever o ataque; uma de permitidos
 * precisa prever o uso, que é finito e conhecido. O acervo tem PNG, JPEG, SVG e PDF, mais as
 * fontes de figura, que são texto.
 */
export const ACCEPTED: Readonly<Record<string, readonly string[]>> = {
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/svg+xml": [".svg"],
  "image/webp": [".webp"],
  "application/pdf": [".pdf"],
  "text/plain": [".txt", ".tex", ".gnuplot", ".pgf", ".asy", ".table", ".knd"],
};

/** 64 MB por arquivo. O acervo inteiro tem 109 MB, então isto é folga, não limite apertado. */
export const MAX_UPLOAD_BYTES = 64 * 1024 * 1024;

export function assertAcceptable(candidate: UploadCandidate): void {
  if (candidate.sizeBytes <= 0) {
    throw new UploadRejectedError("empty", "O arquivo está vazio.");
  }
  if (candidate.sizeBytes > MAX_UPLOAD_BYTES) {
    throw new UploadRejectedError(
      "size",
      `O arquivo tem ${mb(candidate.sizeBytes)}, e o limite é ${mb(MAX_UPLOAD_BYTES)}.`,
    );
  }

  const extensions = ACCEPTED[candidate.mimeType];
  if (extensions === undefined) {
    throw new UploadRejectedError(
      "mime",
      `Arquivos \`${candidate.mimeType}\` não são aceitos. Aceitos: ${Object.keys(ACCEPTED).join(", ")}.`,
    );
  }

  const extension = extensionOf(candidate.filename);
  if (extension === null) {
    throw new UploadRejectedError("extension", "O arquivo precisa ter extensão.");
  }
  if (!extensions.includes(extension)) {
    // O MIME e a extensão discordam. Ou o arquivo foi renomeado, ou é outra coisa — e as duas
    // possibilidades pedem que alguém olhe, não que o sistema escolha uma.
    throw new UploadRejectedError(
      "mismatch",
      `A extensão \`${extension}\` não combina com \`${candidate.mimeType}\` ` +
        `(esperado: ${extensions.join(", ")}).`,
    );
  }
}

const mb = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function extensionOf(filename: string): string | null {
  const base = filename.split(/[/\\]/).pop() ?? filename;
  const dot = base.lastIndexOf(".");

  // `dot < 1` cobre tanto "sem extensão" quanto ".gitignore", que é nome, não extensão.
  return dot < 1 ? null : base.slice(dot).toLowerCase();
}

/**
 * O nome que fica guardado como `originalFilename`.
 *
 * Só para leitura humana — a identidade é o hash. Diretório é removido porque o nome vem do
 * cliente e pode carregar caminho inteiro; caractere de controle sai porque nome de arquivo com
 * `\n` quebra qualquer listagem.
 */
export function sanitizeFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? filename;

  return (
    base
      // Escapes explícitos, e não os caracteres literais: um `\n` cru dentro da classe é
      // invisível no editor e some em qualquer trânsito por ferramenta que normalize texto.
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim()
      .slice(0, 200) || "sem-nome"
  );
}

/**
 * O snippet de figura.
 *
 * `\includegraphics` dentro de `figure` com `caption` e `label` — e o `label` sai do nome do
 * arquivo, porque um `\label{fig:}` vazio é pior que nenhum: ele compila, referencia nada, e o
 * `\ref` correspondente vira "??" no PDF final sem erro nenhum.
 */
export interface FigureOptions {
  readonly assetName: string;
  readonly caption?: string;
  readonly label?: string;
  /** Fração de `\textwidth`. `null` deixa o LaTeX decidir. */
  readonly widthFraction?: number | null;
}

export function figureSnippet(options: FigureOptions): string {
  const label = options.label?.trim() || labelFrom(options.assetName);
  const width =
    options.widthFraction === null || options.widthFraction === undefined
      ? ""
      : `[width=${options.widthFraction.toFixed(2)}\\textwidth]`;

  return [
    "\\begin{figure}[htbp]",
    "  \\centering",
    `  \\includegraphics${width}{${options.assetName}}`,
    ...(options.caption?.trim() ? [`  \\caption{${options.caption.trim()}}`] : []),
    `  \\label{fig:${label}}`,
    "\\end{figure}",
  ].join("\n");
}

/** Um rótulo previsível a partir do nome: minúsculo, sem acento, sem espaço. */
function labelFrom(assetName: string): string {
  const base = assetName.replace(/\.[^.]+$/, "");

  return (
    base
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "figura"
  );
}
