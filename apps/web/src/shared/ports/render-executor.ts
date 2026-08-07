/**
 * Fronteira primária: **Render**.
 *
 * O renderer é **storage-agnostic** (D35). Ele recebe tudo o que precisa para compilar e
 * devolve bytes; quem persiste é a aplicação:
 *
 * ```text
 * App ──RenderBundle──▶ Renderer ──RenderResult──▶ App ──▶ StorageProvider
 * ```
 *
 * É isso que permite ao container rodar **sem rede de saída** e **sem credencial nenhuma** —
 * o que ele não tem, ele não pode vazar. O plano anterior exigia container sem egress *e*
 * gravando em object storage remoto; as duas coisas não podiam ser verdadeiras juntas.
 *
 * Módulos editoriais nunca chamam a compilação diretamente.
 *
 * Ver `docs/_atual/_planejamento.md` §4.7 · D27 · D35 · spec §12.4.
 */

export type LatexEngine = "pdflatex" | "xelatex" | "lualatex";

/** Arquivo posto no diretório temporário de compilação, relativo à raiz do job. */
export interface RenderAsset {
  /** Caminho relativo, sem `..` e sem barra inicial. Validado pelo executor. */
  readonly path: string;
  readonly content: Uint8Array;
}

export interface RenderOptions {
  readonly engine?: LatexEngine;
  /** DPI do PNG derivado do PDF. */
  readonly dpi?: number;
  readonly timeoutMs?: number;
  /** Quando falso, o executor devolve só o PDF. */
  readonly png?: boolean;
}

export interface RenderBundle {
  readonly jobId: string;
  readonly sourceLatex: string;
  /** Nome do `LatexProfile` — define documentclass, packages, macros e engine. */
  readonly profile: string;
  readonly assets: readonly RenderAsset[];
  readonly options: RenderOptions;
}

export type DiagnosticSeverity = "error" | "warning" | "info";

export interface RenderDiagnostic {
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  /** 1-based, quando o log do TeX permite mapear. */
  readonly line?: number;
  readonly column?: number;
  readonly file?: string;
}

export interface RenderResult {
  readonly success: boolean;
  readonly pdf?: Uint8Array;
  readonly png?: Uint8Array;
  /** Erro de TeX vira diagnóstico estruturado, nunca stack trace cru (spec §34). */
  readonly diagnostics: readonly RenderDiagnostic[];
  readonly stdout?: string;
  readonly stderr?: string;
  readonly durationMs: number;
}

export interface RenderExecutor {
  render(bundle: RenderBundle): Promise<RenderResult>;
}

/** Lançado quando o worker não responde. Degrada com mensagem clara, sem perder edição. */
export class RendererUnavailableError extends Error {
  constructor(
    readonly baseUrl: string,
    override readonly cause?: unknown,
  ) {
    super(`Worker de render indisponível em ${baseUrl}`);
    this.name = "RendererUnavailableError";
  }
}

/** Resposta de `GET /health` do worker, consumida pela página de Diagnóstico (2ª auditoria §20). */
export interface RendererHealth {
  readonly status: "ok" | "degraded";
  readonly rendererVersion: string;
  readonly pdfLatexVersion: string;
  readonly pdfToCairoVersion: string;
  readonly profileCount: number;
}
