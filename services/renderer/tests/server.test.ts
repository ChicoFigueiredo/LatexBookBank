import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { DEFAULT_RENDER_OPTIONS, type RenderBundle } from "@latexbookbank/render-contract";

import { AUTH_HEADER, MissingSecretError, requireSecret } from "../src/auth.ts";
import { JobStore } from "../src/jobs.ts";
import { createHandler } from "../src/server.ts";

/**
 * As rotas, exercitadas de verdade — inclusive a compilação.
 *
 * `createHandler` devolve a função de fetch em vez de subir o servidor, então o teste chama as
 * rotas sem abrir porta. A compilação por dentro é a real; um worker que responde 200 com um
 * `pdflatex` falso não prova nada sobre o worker.
 */

const SECRET = "s".repeat(32);
const deps = { secret: SECRET, rendererVersion: "teste-1" };

const bundle = (over: Partial<RenderBundle> = {}): RenderBundle => ({
  jobId: `job-${Math.random().toString(36).slice(2)}`,
  sourceLatex: "Olá $x^2$",
  profile: {
    id: "minimo",
    documentClass: "article",
    documentClassOptions: [],
    preamble: ["\\usepackage[utf8]{inputenc}"],
    engine: "pdflatex",
  },
  assets: [],
  options: DEFAULT_RENDER_OPTIONS,
  ...over,
});

function renderRequest(payload: RenderBundle, files: Record<string, Buffer> = {}): Request {
  const form = new FormData();
  form.set("bundle", JSON.stringify(payload));
  for (const [name, bytes] of Object.entries(files)) {
    form.set(name, new Blob([new Uint8Array(bytes)]), name);
  }

  return new Request("http://renderer/render", {
    method: "POST",
    headers: { [AUTH_HEADER]: SECRET },
    body: form,
  });
}

describe("requireSecret", () => {
  it("recusa subir sem segredo", () => {
    // O caminho fácil seria gerar um aleatório; aí o worker sobe, "funciona", e ninguém descobre
    // que está aberto até alguém varrer a porta.
    expect(() => requireSecret({})).toThrow(MissingSecretError);
  });

  it("recusa segredo curto demais", () => {
    expect(() => requireSecret({ RENDERER_SECRET: "curto" })).toThrow(MissingSecretError);
  });

  it("aceita segredo de 32 ou mais", () => {
    expect(requireSecret({ RENDERER_SECRET: SECRET })).toBe(SECRET);
  });
});

describe("autenticação", () => {
  const handle = createHandler(deps);

  it("recusa sem o cabeçalho", async () => {
    const response = await handle(new Request("http://renderer/render", { method: "POST" }));
    expect(response.status).toBe(401);
  });

  it("recusa segredo errado do mesmo tamanho", async () => {
    const response = await handle(
      new Request("http://renderer/render", {
        method: "POST",
        headers: { [AUTH_HEADER]: "x".repeat(32) },
      }),
    );
    expect(response.status).toBe(401);
  });

  it("não trava com segredo de tamanho diferente", async () => {
    // `timingSafeEqual` lança quando os tamanhos diferem; sem a checagem anterior, o worker
    // devolveria 500 e o tipo da resposta vazaria o tamanho do segredo.
    const response = await handle(
      new Request("http://renderer/render", { method: "POST", headers: { [AUTH_HEADER]: "a" } }),
    );
    expect(response.status).toBe(401);
  });
});

describe("GET /health", () => {
  it("responde sem autenticação — quem consulta é o orquestrador, que não tem o segredo", async () => {
    const response = await createHandler(deps)(new Request("http://renderer/health"));
    expect(response.status).toBe(200);
  });

  it("traz as versões dos binários e a do renderer", async () => {
    const response = await createHandler(deps)(new Request("http://renderer/health"));
    const health = (await response.json()) as Record<string, unknown>;

    expect(health["status"]).toBe("ok");
    expect(health["rendererVersion"]).toBe("teste-1");
    expect(String(health["pdfLatexVersion"])).toContain("pdfTeX");
    expect(String(health["pdfToCairoVersion"])).toContain("pdftocairo");
  });

  it("`profileCount` é zero, e é a resposta honesta", async () => {
    // O worker não tem catálogo: o perfil vem resolvido dentro do bundle. Inventar um número aqui
    // sugeriria um estado que não existe.
    const response = await createHandler(deps)(new Request("http://renderer/health"));
    const health = (await response.json()) as Record<string, unknown>;
    expect(health["profileCount"]).toBe(0);
  });
});

describe("POST /render", () => {
  it("compila e devolve o job concluído", async () => {
    const payload = bundle();
    const response = await createHandler(deps)(renderRequest(payload));
    const status = (await response.json()) as {
      state: string;
      result: { success: boolean; pdf: { name: string } | null };
    };

    expect(response.status).toBe(200);
    expect(status.state).toBe("done");
    expect(status.result.success).toBe(true);
    expect(status.result.pdf?.name).toBe("main.pdf");
  });

  it("recusa corpo que não é multipart", async () => {
    const response = await createHandler(deps)(
      new Request("http://renderer/render", {
        method: "POST",
        headers: { [AUTH_HEADER]: SECRET, "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(response.status).toBe(400);
  });

  it("recusa manifesto que promete um asset que não veio", async () => {
    const payload = bundle({
      assets: [{ name: "f.png", mimeType: "image/png", sizeBytes: 1, sha256: "a".repeat(64) }],
    });
    const response = await createHandler(deps)(renderRequest(payload));

    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect(String(body["error"])).toContain("não veio no multipart");
  });

  it("erro de LaTeX vira `failed` com diagnóstico, não 500", async () => {
    const response = await createHandler(deps)(
      renderRequest(bundle({ sourceLatex: "\\naoExiste" })),
    );
    const status = (await response.json()) as { state: string; result: { diagnostics: unknown[] } };

    expect(response.status).toBe(200);
    expect(status.state).toBe("failed");
    expect(status.result.diagnostics.length).toBeGreaterThan(0);
  });

  it("bundle inválido vira 422 com a razão, não exceção", async () => {
    const response = await createHandler(deps)(renderRequest(bundle({ sourceLatex: "" })));
    expect(response.status).toBe(422);
  });

  it("recebe o asset pelo multipart e o LaTeX o encontra", async () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const payload = bundle({
      sourceLatex: "\\includegraphics[width=1cm]{ponto.png}",
      profile: {
        ...bundle().profile,
        preamble: ["\\usepackage[utf8]{inputenc}", "\\usepackage{graphicx}"],
      },
      assets: [
        {
          name: "ponto.png",
          mimeType: "image/png",
          sizeBytes: png.byteLength,
          sha256: createHash("sha256").update(png).digest("hex"),
        },
      ],
    });

    const response = await createHandler(deps)(renderRequest(payload, { "ponto.png": png }));
    expect(((await response.json()) as { state: string }).state).toBe("done");
  });
});

describe("GET /render/:id e artefatos", () => {
  it("devolve os bytes do PDF compilado", async () => {
    const handle = createHandler(deps);
    const payload = bundle();
    await handle(renderRequest(payload));

    const response = await handle(
      new Request(`http://renderer/render/${payload.jobId}/artifacts/main.pdf`, {
        headers: { [AUTH_HEADER]: SECRET },
      }),
    );

    expect(response.headers.get("content-type")).toBe("application/pdf");
    const bytes = Buffer.from(await response.arrayBuffer());
    // `%PDF` é a assinatura; se vier outra coisa, o worker devolveu o arquivo errado.
    expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("404 para job que não existe", async () => {
    const response = await createHandler(deps)(
      new Request("http://renderer/render/inexistente", { headers: { [AUTH_HEADER]: SECRET } }),
    );
    expect(response.status).toBe(404);
  });
});

describe("cancelamento", () => {
  it("cancela job na fila e impede que ele comece", () => {
    // É aqui que "render pendente é cancelado quando ainda não iniciou" vira código: quem cancela
    // só muda o estado, e `start` é quem decide não gastar um `pdflatex` com o que ninguém quer.
    const store = new JobStore();
    store.enqueue("j1");

    expect(store.cancel("j1")).toBe(true);
    expect(store.start("j1")).toBe(false);
    expect(store.status("j1")?.state).toBe("cancelled");
  });

  it("não cancela job que já terminou", async () => {
    const store = new JobStore();
    const handle = createHandler({ ...deps, store });
    const payload = bundle();
    await handle(renderRequest(payload));

    const response = await handle(
      new Request(`http://renderer/render/${payload.jobId}`, {
        method: "DELETE",
        headers: { [AUTH_HEADER]: SECRET },
      }),
    );

    // Apagar um resultado pronto faria a aplicação perder um artefato que talvez já esteja
    // baixando.
    expect(response.status).toBe(409);
  });

  it("job concluído expira e libera a memória", () => {
    let now = 0;
    const store = new JobStore(() => now);
    store.enqueue("j1");
    store.start("j1");
    store.complete(
      "j1",
      {
        jobId: "j1",
        success: true,
        pdf: null,
        png: [],
        diagnostics: [],
        stdout: "",
        stderr: "",
        durationMs: 1,
        rendererVersion: "teste-1",
      },
      new Map([["main.pdf", Buffer.from("x")]]),
    );

    now = 11 * 60 * 1000;
    // Os artefatos vivem em memória; sem expiração, isto é um vazamento com nome de cache.
    expect(store.status("j1")).toBeNull();
    expect(store.size).toBe(0);
  });
});
