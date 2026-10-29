import { describe, expect, it } from "vitest";

import { DEFAULT_RENDER_OPTIONS, type RenderBundle } from "@latexbookbank/render-contract";
import { canonicalRenderInput, renderContentHash } from "@modules/rendering/domain/content-hash";
import { RenderWorkerExecutor } from "@modules/rendering/infrastructure/render-worker-executor";
import { RendererUnavailableError } from "@/shared/ports";

const bundle = (over: Partial<RenderBundle> = {}): RenderBundle => ({
  jobId: "job-1",
  sourceLatex: "Olá $x^2$",
  profile: {
    id: "legacy",
    documentClass: "article",
    documentClassOptions: ["12pt"],
    preamble: ["\\usepackage{amsmath}"],
    engine: "pdflatex",
  },
  assets: [],
  options: DEFAULT_RENDER_OPTIONS,
  ...over,
});

const asset = (name: string, sha: string) => ({
  name,
  mimeType: "image/png",
  sizeBytes: 10,
  sha256: sha.repeat(64).slice(0, 64),
});

/**
 * O hash de conteúdo.
 *
 * Uma chave incompleta não erra de vez em quando: ela serve o PDF antigo em silêncio, e a pessoa
 * fica olhando uma tela que não reflete o que escreveu. Cada teste aqui é um campo que, se sair da
 * chave, produz exatamente esse defeito.
 */
describe("renderContentHash", () => {
  it("é estável para a mesma entrada", async () => {
    expect(await renderContentHash(bundle(), "1.0")).toBe(await renderContentHash(bundle(), "1.0"));
  });

  it("muda com o conteúdo", async () => {
    expect(await renderContentHash(bundle({ sourceLatex: "outro" }), "1.0")).not.toBe(
      await renderContentHash(bundle(), "1.0"),
    );
  });

  it("muda com o preâmbulo", async () => {
    const outro = bundle();
    expect(
      await renderContentHash(
        { ...outro, profile: { ...outro.profile, preamble: ["\\usepackage{tikz}"] } },
        "1.0",
      ),
    ).not.toBe(await renderContentHash(outro, "1.0"));
  });

  it("muda com a classe e com as opções de classe", async () => {
    const base = bundle();
    expect(
      await renderContentHash(
        { ...base, profile: { ...base.profile, documentClass: "book" } },
        "1.0",
      ),
    ).not.toBe(await renderContentHash(base, "1.0"));

    expect(
      await renderContentHash(
        { ...base, profile: { ...base.profile, documentClassOptions: ["10pt"] } },
        "1.0",
      ),
    ).not.toBe(await renderContentHash(base, "1.0"));
  });

  it("muda com o DPI e com o número de passadas", async () => {
    expect(
      await renderContentHash(bundle({ options: { ...DEFAULT_RENDER_OPTIONS, dpi: 300 } }), "1.0"),
    ).not.toBe(await renderContentHash(bundle(), "1.0"));

    expect(
      await renderContentHash(bundle({ options: { ...DEFAULT_RENDER_OPTIONS, passes: 2 } }), "1.0"),
    ).not.toBe(await renderContentHash(bundle(), "1.0"));
  });

  it("muda com os assets", async () => {
    expect(await renderContentHash(bundle({ assets: [asset("f.png", "a")] }), "1.0")).not.toBe(
      await renderContentHash(bundle({ assets: [asset("f.png", "b")] }), "1.0"),
    );
  });

  it("**muda com a versão do renderer**", async () => {
    // A menos óbvia e a mais importante: subir a imagem com um TeX Live novo muda a saída sem
    // mudar uma linha do documento. Sem isto, o cache passa a servir PDF de outra época.
    expect(await renderContentHash(bundle(), "1.0")).not.toBe(
      await renderContentHash(bundle(), "2.0"),
    );
  });

  it("**não** muda com o `jobId`", async () => {
    // `jobId` é identidade de execução, não de conteúdo. Incluí-lo daria chave nova a cada pedido
    // e o cache nunca acertaria.
    expect(await renderContentHash(bundle({ jobId: "outro-job" }), "1.0")).toBe(
      await renderContentHash(bundle(), "1.0"),
    );
  });

  it("**não** muda com o timeout", async () => {
    // O timeout muda quanto tempo esperamos, não o que sai. Incluí-lo faria um render lento
    // invalidar o cache do rápido, para o mesmo documento.
    expect(
      await renderContentHash(
        bundle({ options: { ...DEFAULT_RENDER_OPTIONS, timeoutMs: 90_000 } }),
        "1.0",
      ),
    ).toBe(await renderContentHash(bundle(), "1.0"));
  });

  it("não depende da ordem dos assets", async () => {
    // O mesmo conjunto de arquivos em ordem diferente é o mesmo conjunto: o LaTeX os referencia
    // por nome, não por posição.
    const a = asset("a.png", "1");
    const b = asset("b.png", "2");

    expect(await renderContentHash(bundle({ assets: [a, b] }), "1.0")).toBe(
      await renderContentHash(bundle({ assets: [b, a] }), "1.0"),
    );
  });

  it('não confunde `["a","b"]` com `["ab"]` no preâmbulo', async () => {
    // Concatenadas, as duas listas dariam o mesmo texto canônico e passariam a compartilhar
    // cache. Foi este teste que mostrou que os prefixos por campo não bastavam.
    const base = bundle();
    const dois = { ...base, profile: { ...base.profile, preamble: ["a", "b"] } };
    const um = { ...base, profile: { ...base.profile, preamble: ["ab"] } };

    expect(canonicalRenderInput(dois, "1.0")).not.toBe(canonicalRenderInput(um, "1.0"));
    expect(await renderContentHash(dois, "1.0")).not.toBe(await renderContentHash(um, "1.0"));
  });
});

/**
 * O executor.
 *
 * O `fetch` global é substituído por um dublê — aqui o que interessa é o protocolo e o tratamento
 * de falha, e a compilação de verdade já está coberta no `services/renderer`, contra o `pdflatex`.
 */
describe("RenderWorkerExecutor", () => {
  const config = { baseUrl: "http://renderer:28900", secret: "s".repeat(32) };

  function withFetch<T>(
    impl: (url: string, init: RequestInit) => Promise<Response>,
    run: () => Promise<T>,
  ): Promise<T> {
    const original = globalThis.fetch;
    globalThis.fetch = ((url: string, init: RequestInit) =>
      impl(String(url), init)) as typeof fetch;
    return run().finally(() => {
      globalThis.fetch = original;
    });
  }

  const doneStatus = {
    jobId: "job-1",
    state: "done",
    result: {
      jobId: "job-1",
      success: true,
      pdf: {
        name: "main.pdf",
        mimeType: "application/pdf",
        sizeBytes: 4,
        sha256: "a".repeat(64),
        width: null,
        height: null,
      },
      png: [],
      diagnostics: [],
      stdout: "",
      stderr: "",
      durationMs: 10,
      rendererVersion: "1.0",
    },
  };

  it("manda o segredo no cabeçalho e baixa os artefatos", async () => {
    const seen: string[] = [];

    const outcome = await withFetch(
      async (url, init) => {
        seen.push(url);
        expect((init.headers as Record<string, string>)["x-render-secret"]).toBe(config.secret);
        return url.includes("/artifacts/")
          ? new Response(new Uint8Array([1, 2, 3, 4]))
          : new Response(JSON.stringify(doneStatus));
      },
      () => new RenderWorkerExecutor(config).render(bundle()),
    );

    expect(seen[0]).toBe("http://renderer:28900/render");
    expect(seen[1]).toContain("/artifacts/main.pdf");
    expect(outcome.artifacts.get("main.pdf")?.byteLength).toBe(4);
  });

  it("`/health` vai **sem** o segredo", async () => {
    // É a rota que o orquestrador consulta, e ele não tem o segredo.
    await withFetch(
      async (_url, init) => {
        expect((init.headers as Record<string, string>)["x-render-secret"]).toBeUndefined();
        return new Response(JSON.stringify({ status: "ok" }));
      },
      () => new RenderWorkerExecutor(config).health(),
    );
  });

  it("worker fora do ar vira `RendererUnavailableError`, não erro genérico", async () => {
    // A interface precisa distinguir isto de LaTeX quebrado; senão manda a pessoa procurar
    // defeito no texto dela.
    await expect(
      withFetch(
        () => Promise.reject(new Error("ECONNREFUSED")),
        () => new RenderWorkerExecutor(config).render(bundle()),
      ),
    ).rejects.toBeInstanceOf(RendererUnavailableError);
  });

  it("5xx também é indisponibilidade — é defeito do worker, não do documento", async () => {
    await expect(
      withFetch(
        async () => new Response("boom", { status: 502 }),
        () => new RenderWorkerExecutor(config).render(bundle()),
      ),
    ).rejects.toBeInstanceOf(RendererUnavailableError);
  });

  it("a mensagem diz que o texto continua salvo", async () => {
    const error = await withFetch(
      () => Promise.reject(new Error("fora")),
      () => new RenderWorkerExecutor(config).render(bundle()).catch((e: unknown) => e),
    );

    expect(String((error as Error).message)).toContain("O texto continua salvo");
  });

  it("recusa artefato truncado", async () => {
    // Gravar isto no storage criaria um artefato corrompido com hash correto no banco — o pior
    // tipo de dado ruim, porque parece íntegro.
    await expect(
      withFetch(
        async (url) =>
          url.includes("/artifacts/")
            ? new Response(new Uint8Array([1, 2]))
            : new Response(JSON.stringify(doneStatus)),
        () => new RenderWorkerExecutor(config).render(bundle()),
      ),
    ).rejects.toThrow(/veio com 2 bytes/);
  });

  it("o 422 do worker é falha do worker, mesmo de um worker que não diz isso", async () => {
    // O 422 é "bundle inválido, asset corrompido, disco cheio" — nada que o mesmo LaTeX repita.
    // Um worker anterior ao `failureKind` manda só `success: false`, e sem esta marca a
    // aplicação guardava a falha no cache como se fosse do documento.
    const failed = {
      jobId: "job-1",
      state: "failed",
      result: {
        ...doneStatus.result,
        success: false,
        pdf: null,
        diagnostics: [{ severity: "error", message: "ENOSPC", line: null, file: null }],
      },
    };

    const outcome = await withFetch(
      async () => new Response(JSON.stringify(failed), { status: 422 }),
      () => new RenderWorkerExecutor(config).render(bundle()),
    );

    expect(outcome.result.success).toBe(false);
    expect(outcome.result.failureKind).toBe("worker");
  });

  it("`rendererVersion()` lê a versão que o worker reporta, e a guarda por um tempo", async () => {
    // É a imagem que compila quem sabe se mudou; a do ambiente da aplicação só mudava quando
    // alguém lembrava. Guardada por pouco tempo: `/health` a cada compilação seria uma ida a mais
    // por nada, e guardar para sempre não veria a imagem reconstruída.
    let reported = "0.0.0-dev+aaaa";
    let calls = 0;
    let clock = 0;

    await withFetch(
      async () => {
        calls += 1;
        return new Response(JSON.stringify({ status: "ok", rendererVersion: reported }));
      },
      async () => {
        const executor = new RenderWorkerExecutor({ ...config, now: () => clock });

        expect(await executor.rendererVersion()).toBe("0.0.0-dev+aaaa");
        reported = "0.0.0-dev+bbbb";
        expect(await executor.rendererVersion()).toBe("0.0.0-dev+aaaa");
        expect(calls).toBe(1);

        clock += 60_000;
        expect(await executor.rendererVersion()).toBe("0.0.0-dev+bbbb");
      },
    );
  });

  it("valida o bundle antes de subir os assets pela rede", async () => {
    let called = false;
    await expect(
      withFetch(
        async () => {
          called = true;
          return new Response("{}");
        },
        () => new RenderWorkerExecutor(config).render(bundle({ sourceLatex: "" })),
      ),
    ).rejects.toThrow(/sourceLatex/);

    expect(called).toBe(false);
  });
});
