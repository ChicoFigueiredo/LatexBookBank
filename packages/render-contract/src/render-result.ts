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
  /**
   * Linha do `sourceLatex` — **do corpo**, contando de 1, e não do documento compilado.
   *
   * O `pdflatex` conta a partir do `\documentclass`, com o preâmbulo inteiro no meio; quem traduz
   * é o worker, que é o único que sabe como montou o arquivo. É o que permite ao editor marcar a
   * linha certa, e `null` significa que a linha não é do texto de quem escreveu — erro de
   * preâmbulo, de pacote, ou mensagem que não informa lugar nenhum.
   */
  readonly line: number | null;
  /** Arquivo que o LaTeX citou — normalmente o documento, às vezes um pacote. */
  readonly file: string | null;
}

/** De quem é a falha: do documento, do relógio ou do worker. Ver `RenderResult.failureKind`. */
export type RenderFailureKind = "document" | "timeout" | "worker";

export interface RenderResult {
  readonly jobId: string;
  /**
   * `true` quando saiu um PDF.
   *
   * Não é o mesmo que "sem diagnóstico": o LaTeX produz PDF com dezenas de avisos o tempo todo, e
   * tratar aviso como falha esconderia o resultado de quem só queria ver a questão.
   */
  readonly success: boolean;
  /**
   * Por que não saiu PDF — ausente quando saiu.
   *
   * Só `document` é resultado do documento: o mesmo LaTeX dá a mesma falha, e a aplicação pode
   * guardá-la no cache. `timeout` (a máquina estava ocupada, o formato estava sendo montado) e
   * `worker` (disco cheio, asset corrompido no caminho, binário ausente) são do momento, e
   * guardá-los transformava uma falha passageira numa resposta permanente para aquele LaTeX.
   *
   * Opcional por compatibilidade: um worker anterior a este campo não o manda, e a aplicação trata
   * a ausência como `document`, que era a leitura de antes.
   */
  readonly failureKind?: RenderFailureKind;
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
