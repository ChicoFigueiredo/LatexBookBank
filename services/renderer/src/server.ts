import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { RenderBundle, RenderHealth } from "@latexbookbank/render-contract";

import { AUTH_HEADER, isAuthorized, requireSecret } from "./auth.ts";
import { compile } from "./compile.ts";
import { JobStore } from "./jobs.ts";

/**
 * O worker exposto por HTTP.
 *
 * Quatro rotas e nenhum framework. `Bun.serve` já lê `multipart/form-data` por
 * `request.formData()`, então o roteador de quatro caminhos é mais curto que a configuração de
 * qualquer biblioteca — e cada dependência a menos aqui é uma a menos para auditar numa imagem que
 * vai rodar compilando entrada de terceiro.
 *
 * O que este arquivo **não** tem continua sendo a parte importante: nenhum cliente de banco,
 * nenhum SDK de nuvem, nenhuma leitura de `Workspace`. O worker recebe bytes e devolve bytes.
 */

const run = promisify(execFile);

export interface ServerDeps {
  readonly secret: string;
  readonly rendererVersion: string;
  readonly store?: JobStore;
}

/**
 * Versão de um binário externo, para o `/health`.
 *
 * Falha vira string em vez de exceção: `/health` existe justamente para dizer que alguma coisa
 * está errada, e uma rota de saúde que quebra quando o sistema está doente é a rota inútil.
 */
async function versionOf(command: string, args: readonly string[]): Promise<string> {
  try {
    const { stdout, stderr } = await run(command, [...args], { timeout: 5000 });
    return `${stdout}${stderr}`.split("\n")[0]?.trim() ?? "desconhecida";
  } catch {
    return "indisponível";
  }
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

const problem = (status: number, message: string): Response => json({ error: message }, status);

/**
 * Monta o roteador.
 *
 * Devolve a função de fetch em vez de subir o servidor: assim o teste exercita as rotas de verdade
 * sem abrir porta, e a porta continua sendo decisão de quem chama.
 */
export function createHandler(deps: ServerDeps): (request: Request) => Promise<Response> {
  const store = deps.store ?? new JobStore();

  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // `/health` fica fora da autenticação de propósito: é o que o orquestrador consulta para
    // decidir se o contêiner está vivo, e ele não tem o segredo. A resposta não conta nada que já
    // não se saiba apontando um navegador para a porta.
    if (path === "/health" && request.method === "GET") {
      const [pdfLatexVersion, pdfToCairoVersion] = await Promise.all([
        versionOf("pdflatex", ["--version"]),
        versionOf("pdftocairo", ["-v"]),
      ]);

      const health: RenderHealth = {
        status:
          pdfLatexVersion === "indisponível" || pdfToCairoVersion === "indisponível"
            ? "degraded"
            : "ok",
        rendererVersion: deps.rendererVersion,
        pdfLatexVersion,
        pdfToCairoVersion,
        // O worker não tem catálogo de perfis: o perfil vem resolvido dentro do bundle. O campo
        // existe porque o planejamento o fixou, e zero é a resposta honesta.
        profileCount: 0,
      };
      return json(health);
    }

    if (!isAuthorized(request, deps.secret)) {
      // Sem `WWW-Authenticate`: não há desafio a oferecer, e anunciar o esquema só ajudaria quem
      // está tentando adivinhar o cabeçalho.
      return problem(401, `Cabeçalho \`${AUTH_HEADER}\` ausente ou incorreto.`);
    }

    if (path === "/render" && request.method === "POST") return postRender(request, store, deps);

    const artifactMatch = /^\/render\/([^/]+)\/artifacts\/([^/]+)$/.exec(path);
    if (artifactMatch && request.method === "GET") {
      const bytes = store.artifact(artifactMatch[1] ?? "", artifactMatch[2] ?? "");
      if (bytes === null) return problem(404, "Artefato não encontrado ou já expirado.");

      return new Response(new Uint8Array(bytes), {
        headers: {
          "content-type": (artifactMatch[2] ?? "").endsWith(".pdf")
            ? "application/pdf"
            : "image/png",
          "content-length": String(bytes.byteLength),
        },
      });
    }

    const jobMatch = /^\/render\/([^/]+)$/.exec(path);
    if (jobMatch) {
      const jobId = jobMatch[1] ?? "";

      if (request.method === "GET") {
        const status = store.status(jobId);
        return status === null ? problem(404, "Job não encontrado ou já expirado.") : json(status);
      }
      if (request.method === "DELETE") {
        // Cancelar é idempotente do ponto de vista de quem chama: 200 quando deu, 409 quando o job
        // já terminou. Nos dois casos o cliente sabe que não há mais nada a esperar.
        return store.cancel(jobId)
          ? json({ jobId, state: "cancelled" })
          : problem(409, "O job já terminou; não há o que cancelar.");
      }
    }

    return problem(404, "Rota desconhecida.");
  };
}

/**
 * `POST /render` — recebe o multipart, compila, responde com o estado final.
 *
 * A compilação acontece **dentro** da requisição, e não numa fila em segundo plano. É deliberado:
 * um render de questão leva um a três segundos, e uma fila adicionaria estado, expiração e um
 * segundo caminho de erro para economizar uma espera que a aplicação já trata como assíncrona no
 * lado dela. `GET /render/:id` continua existindo para o cliente que perdeu a resposta.
 */
async function postRender(request: Request, store: JobStore, deps: ServerDeps): Promise<Response> {
  // Sem anotar o tipo: `@types/node` traz o `FormData` do undici e o `@types/bun` traz o da
  // plataforma, e os dois divergem sob `exactOptionalPropertyTypes`. Deixar inferir usa o que a
  // própria `Request` devolve, que é o único correto aqui.
  const form = await request.formData().catch(() => null);
  if (form === null) {
    return problem(400, "Corpo precisa ser `multipart/form-data`.");
  }

  const manifest = form.get("bundle");
  if (typeof manifest !== "string") {
    return problem(400, "Parte `bundle` ausente — o manifesto do job vai nela, em JSON.");
  }

  let bundle: RenderBundle;
  try {
    bundle = JSON.parse(manifest) as RenderBundle;
  } catch {
    return problem(400, "Parte `bundle` não é JSON válido.");
  }

  const assets = new Map<string, Buffer>();
  for (const asset of bundle.assets ?? []) {
    const part = form.get(asset.name);
    if (!(part instanceof Blob)) {
      return problem(400, `Asset \`${asset.name}\` está no manifesto mas não veio no multipart.`);
    }
    assets.set(asset.name, Buffer.from(await part.arrayBuffer()));
  }

  store.enqueue(bundle.jobId);
  if (!store.start(bundle.jobId)) {
    return problem(409, "O job foi cancelado antes de começar.");
  }

  try {
    const { result, artifacts } = await compile(bundle, assets, {
      rendererVersion: deps.rendererVersion,
    });
    store.complete(bundle.jobId, result, artifacts);
    return json(store.status(bundle.jobId));
  } catch (error) {
    // Erro aqui é do worker, não do documento — bundle inválido, asset corrompido, binário
    // ausente. O job vira `failed` para o cliente não ficar esperando um resultado que não vem.
    store.complete(
      bundle.jobId,
      {
        jobId: bundle.jobId,
        success: false,
        pdf: null,
        png: [],
        diagnostics: [
          {
            severity: "error",
            message: error instanceof Error ? error.message : "Falha desconhecida no worker.",
            line: null,
            file: null,
          },
        ],
        stdout: "",
        stderr: "",
        durationMs: 0,
        rendererVersion: deps.rendererVersion,
      },
      new Map(),
    );
    return json(store.status(bundle.jobId), 422);
  }
}

/** Entrada do contêiner. */
export function startServer(): void {
  const secret = requireSecret(process.env);
  const port = Number(process.env["RENDERER_PORT"] ?? 28900);

  Bun.serve({
    port,
    // O endereço vem do ambiente porque o contêiner precisa escutar em `0.0.0.0` e a máquina de
    // desenvolvimento não deveria.
    hostname: process.env["RENDERER_HOST"] ?? "127.0.0.1",
    fetch: createHandler({
      secret,
      rendererVersion: process.env["RENDERER_VERSION"] ?? "0.0.0-dev",
    }),
  });

  console.log(`renderer escutando em ${port}`);
}
