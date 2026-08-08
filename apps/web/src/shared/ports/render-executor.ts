import type { RenderBundle, RenderHealth, RenderResult } from "@latexbookbank/render-contract";

/**
 * Fronteira primária: **Render**.
 *
 * O renderer é **storage-agnostic** (D35). Ele recebe tudo o que precisa para compilar e devolve
 * bytes; quem persiste é a aplicação:
 *
 * ```text
 * App ──RenderBundle──▶ Renderer ──RenderResult + bytes──▶ App ──▶ StorageProvider
 * ```
 *
 * É isso que permite ao contêiner rodar **sem rede de saída** e **sem credencial nenhuma** — o que
 * ele não tem, ele não pode vazar. O plano anterior exigia contêiner sem egress *e* gravando em
 * object storage remoto; as duas coisas não podiam ser verdadeiras juntas.
 *
 * ## Por que este arquivo não declara mais os tipos
 *
 * A primeira versão, da Fase 0, declarava `RenderBundle` e `RenderResult` aqui dentro — antes de o
 * D35 existir. Quando o contrato virou pacote (#57), passaram a existir **duas** definições da
 * mesma coisa, e elas já divergiam: o perfil era um nome aqui e um objeto resolvido lá; os assets
 * traziam bytes aqui e metadados lá; `pdf` era `Uint8Array` aqui e descritor lá.
 *
 * Duas definições da mesma coisa não empatam — uma delas fica errada, e ninguém descobre qual até
 * a integração falhar. Agora há uma só, no pacote que o worker também importa, e este arquivo
 * declara apenas o que é da **aplicação**: a interface que os módulos editoriais chamam.
 *
 * Módulos editoriais nunca chamam a compilação diretamente.
 *
 * Ver `docs/_atual/_planejamento.md` §4.7 · D27 · D35 · spec §12.4.
 */

export type {
  RenderArtifactDescriptor,
  RenderBundle,
  RenderDiagnostic,
  RenderHealth,
  RenderJobStatus,
  RenderOptions,
  RenderProfile,
  RenderResult,
} from "@latexbookbank/render-contract";

/**
 * O resultado, com os bytes que a aplicação vai persistir.
 *
 * O `RenderResult` do contrato descreve os artefatos; quem grava precisa deles. Os bytes ficam
 * **fora** do `RenderResult` de propósito: o mesmo objeto é serializado no `GET /render/:id`, que
 * é consultado em laço, e embutir megabytes ali faria toda consulta de progresso arrastar o PDF.
 */
export interface RenderOutcome {
  readonly result: RenderResult;
  /** Bytes por nome de artefato — `main.pdf`, `page-1.png`… */
  readonly artifacts: ReadonlyMap<string, Uint8Array>;
}

export interface RenderExecutor {
  /**
   * Compila.
   *
   * Os bytes dos assets vêm **como argumento**, e não dentro do bundle: o bundle é o manifesto,
   * viaja em JSON, e misturar bytes ali obrigaria a base64 — que é exatamente o que a escolha do
   * multipart evitou (D35).
   *
   * Vir como argumento também é o que mantém o executor sem estado. A primeira versão guardava os
   * bytes numa propriedade, e dois renders concorrentes teriam sobrescrito os assets um do outro.
   */
  render(bundle: RenderBundle, assets?: ReadonlyMap<string, Uint8Array>): Promise<RenderOutcome>;

  health(): Promise<RenderHealth>;
}

/**
 * Worker fora do ar.
 *
 * Tem tipo próprio porque o critério de aceite da fase é explícito: **degrada com mensagem clara,
 * sem perder edição**. Uma exceção genérica levaria a interface a mostrar "erro ao renderizar" —
 * que é indistinguível de LaTeX quebrado, e manda a pessoa procurar defeito no texto dela.
 */
export class RendererUnavailableError extends Error {
  constructor(
    readonly baseUrl: string,
    override readonly cause?: unknown,
  ) {
    super(
      `O worker de render não respondeu em ${baseUrl}. ` +
        "O texto continua salvo; o PDF sai quando ele voltar.",
    );
    this.name = "RendererUnavailableError";
  }
}
