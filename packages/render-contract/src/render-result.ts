/**
 * `RenderResult` — tudo que o renderer devolve, e nada além.
 *
 * O worker **não persiste**. Ele devolve bytes e a aplicação os grava via `StorageProvider`
 * (D35). É por isso que não há `storageKey` aqui, nem URL de bucket: o worker não sabe onde o
 * artefato vai parar, e não saber é a propriedade que faz ele rodar sem credencial nenhuma.
 *
 * ## Por que descritor e não bytes
 *
 * `pdf` e `png` descrevem o artefato; os bytes vêm em `GET /render/:id/artifacts/:name`. Colocar
 * megabytes dentro do JSON de status faria toda consulta de progresso arrastar o PDF inteiro
 * atrás — e são consultas repetidas, enquanto o download é um só. O `sha256` no descritor é o que
 * deixa a aplicação decidir se precisa baixar: artefato de mesmo hash já está no storage.
 */

export interface RenderArtifactDescriptor {
  /** Nome dentro do job, e o que vai no caminho de download. */
  readonly name: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  /** Só para imagem; `null` no PDF. */
  readonly width: number | null;
  readonly height: number | null;
}

/**
 * Um problema encontrado na compilação, **já traduzido**.
 *
 * O critério de aceite da fase é explícito: erro de TeX aparece como diagnóstico, não como stack
 * trace cru. Por isso o worker devolve linha e mensagem separadas — quem monta a interface não
 * deveria estar escrevendo regex em cima do log do LaTeX.
 *
 * O log cru continua vindo em `stdout`/`stderr`, porque toda tradução perde alguma coisa e a
 * pessoa que abre a aba "Log" está justamente atrás do que se perdeu.
 */
export interface RenderDiagnostic {
  readonly severity: "error" | "warning" | "info";
  readonly message: string;
  /** Linha do `sourceLatex`, quando o LaTeX informa. */
  readonly line: number | null;
  /** Arquivo que o LaTeX citou — normalmente o documento, às vezes um pacote. */
  readonly file: string | null;
}

export interface RenderResult {
  readonly jobId: string;
  /**
   * `true` quando saiu um PDF.
   *
   * Não é o mesmo que "sem diagnóstico": o LaTeX produz PDF com dezenas de avisos o tempo todo, e
   * tratar aviso como falha esconderia o resultado de quem só queria ver a questão.
   */
  readonly success: boolean;
  readonly pdf: RenderArtifactDescriptor | null;
  /** Uma entrada por página. Questão avulsa dá uma; lista inteira dá várias. */
  readonly png: readonly RenderArtifactDescriptor[];
  readonly diagnostics: readonly RenderDiagnostic[];
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  /**
   * Versão do renderer que produziu isto.
   *
   * Entra no hash de cache do lado da aplicação: subir a imagem com um TeX Live novo tem de
   * invalidar o que foi compilado com o antigo, ou o cache passa a servir PDF de outra época.
   */
  readonly rendererVersion: string;
}

/** Resposta do `GET /health`, na forma que o planejamento §Fase 6 fixou. */
export interface RenderHealth {
  readonly status: "ok" | "degraded";
  readonly rendererVersion: string;
  readonly pdfLatexVersion: string;
  readonly pdfToCairoVersion: string;
  readonly profileCount: number;
}

/** Estado de um job, para o `GET /render/:id` enquanto ele não terminou. */
export type RenderJobState = "queued" | "running" | "done" | "failed" | "cancelled";

export interface RenderJobStatus {
  readonly jobId: string;
  readonly state: RenderJobState;
  /** Presente somente em `done` e `failed`. */
  readonly result: RenderResult | null;
}
