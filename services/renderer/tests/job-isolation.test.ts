import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_RENDER_OPTIONS,
  type RenderBundle,
  type RenderProfile,
} from "@latexbookbank/render-contract";

import { AUTH_HEADER } from "../src/auth.ts";
import { compile } from "../src/compile.ts";
import { ensureFormat, formatKey, FORMATS_DIR } from "../src/format-cache.ts";
import { JobStore } from "../src/jobs.ts";
import { createHandler } from "../src/server.ts";

/**
 * Um job não enxerga o outro, e o que sai de um job é só dele (tarefa F5 da revisão de
 * 2026-09-23: SEC-07, PLT-11, PLT-14, PLT-15).
 *
 * Contra o `pdflatex` de verdade, como o resto da suíte do worker.
 */

const SECRET = "s".repeat(32);
const deps = { rendererVersion: "teste-1" };

/** Um perfil só deste teste: o formato dele não colide com o de outro arquivo da suíte. */
const profile = (marker: string): RenderProfile => ({
  id: "isolado",
  documentClass: "article",
  documentClassOptions: [],
  preamble: ["\\usepackage[utf8]{inputenc}", `% ${marker}`],
  engine: "pdflatex",
});

const bundle = (over: Partial<RenderBundle> = {}): RenderBundle => ({
  jobId: `job-${Math.random().toString(36).slice(2)}`,
  sourceLatex: "Olá $x^2$",
  profile: profile(`base-${process.pid}`),
  assets: [],
  options: DEFAULT_RENDER_OPTIONS,
  ...over,
});

function renderRequest(payload: RenderBundle): Request {
  const form = new FormData();
  form.set("bundle", JSON.stringify(payload));
  return new Request("http://renderer/render", {
    method: "POST",
    headers: { [AUTH_HEADER]: SECRET },
    body: form,
  });
}

describe("o jobId é de um job só", () => {
  it("o store recusa um id que já está em andamento, em vez de sobrescrever", () => {
    const store = new JobStore();

    expect(store.enqueue("candidate-1")).toBe(true);
    expect(store.enqueue("candidate-1")).toBe(false);
    expect(store.start("candidate-1")).toBe(true);
    expect(store.enqueue("candidate-1")).toBe(false);
  });

  it("duas compilações com o mesmo id: uma compila, a outra recebe 409 e não toca na primeira", async () => {
    // O "antes" e o "depois" da revisão compilavam com `preview-statementLatex`: o segundo
    // sobrescrevia a entrada do primeiro, e um lado baixava os bytes do outro.
    const handle = createHandler({ secret: SECRET, ...deps });
    const id = `preview-${Math.random().toString(36).slice(2)}`;

    const responses = await Promise.all([
      handle(renderRequest(bundle({ jobId: id, sourceLatex: "Antes" }))),
      handle(renderRequest(bundle({ jobId: id, sourceLatex: "Depois" }))),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
  });
});

describe("só as páginas do PDF saem como páginas", () => {
  it("uma figura chamada `page-3.png` não vira página renderizada", async () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const { result } = await compile(
      bundle({
        sourceLatex: "\\includegraphics[width=1cm]{page-3.png}",
        profile: {
          ...profile(`figura-${process.pid}`),
          preamble: ["\\usepackage[utf8]{inputenc}", "\\usepackage{graphicx}"],
        },
        assets: [
          {
            name: "page-3.png",
            mimeType: "image/png",
            sizeBytes: png.byteLength,
            sha256: createHash("sha256").update(png).digest("hex"),
          },
        ],
      }),
      new Map([["page-3.png", png]]),
      deps,
    );

    expect(result.success).toBe(true);
    expect(result.png.map((page) => page.name)).toEqual(["page-1.png"]);
  });
});

describe("o formato pré-compilado", () => {
  it("um `.fmt` corrompido não derruba o perfil: compila sem ele e o descarta", async () => {
    // Um `-ini` morto no meio do dump deixava o arquivo pela metade em /tmp/lbb-formats, e todo
    // render daquele perfil falhava com "Fatal format file error" até reiniciar o contêiner.
    const corrupt = profile(`corrompido-${process.pid}-${Date.now()}`);
    const file = join(FORMATS_DIR, `${formatKey(corrupt)}.fmt`);
    await mkdir(FORMATS_DIR, { recursive: true });
    await writeFile(file, "isto não é um formato");

    const { result } = await compile(bundle({ profile: corrupt }), new Map(), deps);

    expect(result.success).toBe(true);
    expect(existsSync(file) ? readFileSync(file, "utf8") : null).not.toBe("isto não é um formato");
  });

  it("preâmbulo com erro não publica formato nenhum", async () => {
    // Com `nonstopmode`, o `-ini` segue depois do erro; um formato gravado assim envenena o perfil.
    const marker = profile(`quebrado-${process.pid}-${Date.now()}`);
    const broken: RenderProfile = {
      ...marker,
      preamble: [...marker.preamble, "\\comandoQueNaoExisteNoPreambulo"],
    };

    expect(await ensureFormat(broken, 30_000)).toBeNull();
    expect(existsSync(join(FORMATS_DIR, `${formatKey(broken)}.fmt`))).toBe(false);
  });
});

describe("o prazo é do job inteiro", () => {
  it("passadas a mais param na primeira que falha, e o erro aparece uma vez", async () => {
    // Três passadas sobre um erro davam o mesmo diagnóstico três vezes, e o triplo do tempo.
    const once = await compile(bundle({ sourceLatex: "\\naoExiste" }), new Map(), deps);
    const thrice = await compile(
      bundle({
        sourceLatex: "\\naoExiste",
        options: { ...DEFAULT_RENDER_OPTIONS, passes: 3 },
      }),
      new Map(),
      deps,
    );

    expect(thrice.result.diagnostics).toEqual(once.result.diagnostics);
  });

  it("o que sobra do prazo é o que cada etapa recebe: estourado, nada mais roda", async () => {
    // O relógio salta o prazo inteiro depois da largada: a etapa seguinte não pode ganhar um
    // `timeoutMs` novo em folha, que era como 30 s viravam 150 s.
    let calls = 0;
    const { result } = await compile(bundle(), new Map(), {
      ...deps,
      now: () => (calls++ === 0 ? 0 : 1_000_000),
    });

    expect(result.success).toBe(false);
    expect(result.failureKind).toBe("timeout");
  });
});
