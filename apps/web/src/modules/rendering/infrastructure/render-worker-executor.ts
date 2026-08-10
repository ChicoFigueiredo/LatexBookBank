import type { RenderBundle, RenderHealth, RenderJobStatus } from "@latexbookbank/render-contract";
import { validateRenderBundle } from "@latexbookbank/render-contract";
import { RendererUnavailableError, type RenderExecutor, type RenderOutcome } from "@/shared/ports";

/**
 * O `RenderExecutor` que fala com o worker em Docker.
 *
 * **A única diferença entre local e droplet é o `baseUrl`.** Não há `if (produção)` aqui, e é essa
 * ausência que faz a Fase 6.5 ser um spike e não uma reescrita: a mesma imagem, o mesmo protocolo,
 * outro endereço.
 *
 * A aplicação **baixa os bytes e persiste** (D35). O worker devolve descritores; quem grava é o
 * `StorageProvider`, do lado de cá. É o que permite ao worker não ter credencial nenhuma.
 */

export interface RenderWorkerConfig {
  readonly baseUrl: string;
  readonly secret: string;
  /** Teto do lado do cliente; o worker tem o dele, e o menor vence. */
  readonly requestTimeoutMs?: number;
}

const AUTH_HEADER = "x-render-secret";
const DEFAULT_TIMEOUT_MS = 120_000;

export class RenderWorkerExecutor implements RenderExecutor {
  constructor(private readonly config: RenderWorkerConfig) {}

  async health(): Promise<RenderHealth> {
    const response = await this.fetch("/health", { method: "GET" }, false);
    return (await response.json()) as RenderHealth;
  }

  async render(
    bundle: RenderBundle,
    assets: ReadonlyMap<string, Uint8Array> = new Map(),
  ): Promise<RenderOutcome> {
    // Validar antes de enviar, com o **mesmo** código que o worker usa ao receber. Um bundle
    // inválido vira erro aqui, com a mensagem certa, em vez de virar 422 depois de subir os
    // assets pela rede.
    validateRenderBundle(bundle);

    const form = new FormData();
    form.set("bundle", JSON.stringify(bundle));
    for (const asset of bundle.assets) {
      const bytes = assets.get(asset.name);
      if (bytes === undefined) {
        throw new Error(`Asset \`${asset.name}\` está no bundle mas não foi fornecido.`);
      }
      // `Uint8Array<ArrayBufferLike>` não satisfaz `BlobPart`, que exige `ArrayBuffer` — o tipo
      // admite `SharedArrayBuffer`, e um `Blob` sobre memória compartilhada seria uma corrida
      // esperando acontecer. A cópia elimina a dúvida em vez de silenciá-la com um `as`.
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      form.set(asset.name, new Blob([copy.buffer], { type: asset.mimeType }), asset.name);
    }

    const response = await this.fetch("/render", { method: "POST", body: form });
    const status = (await response.json()) as RenderJobStatus;

    if (status.result === null) {
      throw new Error(`O worker devolveu o job \`${bundle.jobId}\` sem resultado.`);
    }

    // Os artefatos vêm depois do status, um a um. É sequencial de propósito: o worker tem um
    // núcleo por job e paralelizar downloads de um mesmo job só disputaria a mesma banda.
    const artifacts = new Map<string, Uint8Array>();
    const descriptors = [...(status.result.pdf ? [status.result.pdf] : []), ...status.result.png];

    for (const descriptor of descriptors) {
      const bytes = await this.fetch(
        `/render/${encodeURIComponent(bundle.jobId)}/artifacts/${encodeURIComponent(descriptor.name)}`,
        { method: "GET" },
      ).then(async (r) => new Uint8Array(await r.arrayBuffer()));

      if (bytes.byteLength !== descriptor.sizeBytes) {
        // Descritor que não bate com os bytes significa download truncado. Gravar isso no storage
        // criaria um artefato corrompido com hash correto no banco — o pior tipo de dado ruim.
        throw new Error(
          `Artefato \`${descriptor.name}\` veio com ${bytes.byteLength} bytes; ` +
            `o descritor diz ${descriptor.sizeBytes}.`,
        );
      }
      artifacts.set(descriptor.name, bytes);
    }

    return { result: status.result, artifacts };
  }

  /**
   * Manda o worker parar.
   *
   * Engole a falha de propósito: se o worker não respondeu ao cancelamento, quem chamou não tem
   * o que fazer a respeito — e propagar transformaria "desisti do render" em erro na tela de
   * quem já estava desistindo.
   */
  async cancel(jobId: string): Promise<void> {
    try {
      await this.fetch(`/render/${encodeURIComponent(jobId)}`, { method: "DELETE" });
    } catch {
      return;
    }
  }

  private async fetch(path: string, init: RequestInit, authenticated = true): Promise<Response> {
    const url = `${this.config.baseUrl.replace(/\/$/, "")}${path}`;
    const timeoutMs = this.config.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;

    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          ...(authenticated ? { [AUTH_HEADER]: this.config.secret } : {}),
        },
        // `AbortSignal.timeout` em vez de um `setTimeout` com `AbortController`: o timer é
        // descartado junto com o sinal, e um worker lento não deixa um temporizador vivo por
        // requisição.
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      // Rede fora, DNS, timeout, contêiner parado — tudo isto é "o worker não respondeu", e a
      // interface precisa distinguir isso de LaTeX quebrado.
      throw new RendererUnavailableError(this.config.baseUrl, error);
    }

    if (response.status >= 500) {
      // 5xx é o worker com defeito, não o documento. Cai no mesmo tratamento de indisponível.
      throw new RendererUnavailableError(this.config.baseUrl, `HTTP ${response.status}`);
    }
    if (!response.ok && response.status !== 422) {
      const body = await response.text().catch(() => "");
      throw new Error(`Worker recusou \`${path}\`: HTTP ${response.status}. ${body}`.trim());
    }

    return response;
  }
}
