import { describe, expect, it } from "vitest";

import {
  DEFAULT_RENDER_OPTIONS,
  type RenderBundle,
  type RenderResult,
} from "@latexbookbank/render-contract";
import { executeRender } from "@modules/rendering/application/execute-render";
import {
  MAX_LOG_CHARS,
  truncateLog,
  type NewRenderJob,
  type RenderJobRecord,
  type RenderJobRepository,
} from "@modules/rendering/domain/render-job";
import {
  asStorageKey,
  type PutAssetInput,
  type StorageKey,
  type RenderExecutor,
  type RenderOutcome,
  type StorageProvider,
  type StoredAsset,
} from "@/shared/ports";

const bundle = (over: Partial<RenderBundle> = {}): RenderBundle => ({
  jobId: "job-1",
  sourceLatex: "Olá",
  profile: {
    id: "legacy",
    documentClass: "article",
    documentClassOptions: [],
    preamble: [],
    engine: "pdflatex",
  },
  assets: [],
  options: DEFAULT_RENDER_OPTIONS,
  ...over,
});

const result = (over: Partial<RenderResult> = {}): RenderResult => ({
  jobId: "job-1",
  success: true,
  pdf: {
    name: "main.pdf",
    mimeType: "application/pdf",
    sizeBytes: 3,
    sha256: "w".repeat(64),
    width: null,
    height: null,
  },
  png: [
    {
      name: "page-1.png",
      mimeType: "image/png",
      sizeBytes: 2,
      sha256: "x".repeat(64),
      width: 800,
      height: 600,
    },
  ],
  diagnostics: [],
  stdout: "log",
  stderr: "",
  durationMs: 1200,
  rendererVersion: "1.0",
  ...over,
});

class FakeExecutor implements RenderExecutor {
  calls = 0;
  constructor(private readonly outcome: RenderOutcome) {}

  cancelled: string[] = [];

  async render(): Promise<RenderOutcome> {
    this.calls += 1;
    return this.outcome;
  }
  async cancel(jobId: string): Promise<void> {
    this.cancelled.push(jobId);
  }
  async health() {
    return {
      status: "ok" as const,
      rendererVersion: "1.0",
      pdfLatexVersion: "",
      pdfToCairoVersion: "",
      profileCount: 0,
    };
  }
}

/** Grava e devolve um hash **próprio** — é ele que precisa chegar ao registro. */
class FakeStorage implements StorageProvider {
  readonly puts: PutAssetInput[] = [];

  async put(input: PutAssetInput): Promise<StoredAsset> {
    this.puts.push(input);
    return {
      storageKey: asStorageKey(`${input.workspaceId}/${this.puts.length}`),
      sha256: `storage-${this.puts.length}`.padEnd(64, "0"),
      sizeBytes: input.content.byteLength,
    };
  }
  async get(_key: StorageKey): Promise<never> {
    throw new Error("não usado");
  }
  /** Chaves que "sumiram" do storage — a limpeza de derivados (D29) apagou. */
  readonly gone = new Set<string>();

  async exists(key: StorageKey) {
    return !this.gone.has(key);
  }
  async delete(_key: StorageKey) {
    /* não usado */
  }
}

class FakeJobs implements RenderJobRepository {
  readonly created: NewRenderJob[] = [];
  private readonly byHash = new Map<string, RenderJobRecord>();

  async findByContentHash(workspaceId: string, hash: string): Promise<RenderJobRecord | null> {
    return this.byHash.get(`${workspaceId}/${hash}`) ?? null;
  }

  async create(job: NewRenderJob): Promise<RenderJobRecord> {
    this.created.push(job);
    const record: RenderJobRecord = { ...job, id: `id-${this.created.length}` };
    this.byHash.set(`${job.workspaceId}/${job.contentHash}`, record);
    return record;
  }

  async remove(jobId: string): Promise<void> {
    for (const [key, record] of this.byHash) {
      if (record.id === jobId) this.byHash.delete(key);
    }
  }
}

const outcome = (over: Partial<RenderResult> = {}): RenderOutcome => ({
  result: result(over),
  artifacts: new Map([
    ["main.pdf", new Uint8Array([1, 2, 3])],
    ["page-1.png", new Uint8Array([4, 5])],
  ]),
});

const deps = (executor: FakeExecutor, storage: FakeStorage, jobs: FakeJobs) => ({
  executor,
  storage,
  jobs,
  rendererVersion: "1.0",
});

const input = { workspaceId: "w1", questionId: "q1", bundle: bundle() };

describe("truncateLog", () => {
  it("não mexe no log pequeno", () => {
    expect(truncateLog("curto")).toBe("curto");
  });

  it("corta pelo meio, não pelo fim", () => {
    // O começo tem a versão do TeX; o fim tem o erro fatal. Cortar só o fim perderia justamente
    // a linha que explica a falha.
    const log = "INICIO" + "x".repeat(MAX_LOG_CHARS) + "FIM";
    const cut = truncateLog(log);

    expect(cut.startsWith("INICIO")).toBe(true);
    expect(cut.endsWith("FIM")).toBe(true);
    expect(cut).toContain("caracteres omitidos");
  });
});

describe("executeRender", () => {
  it("compila, grava os artefatos no storage e registra o job", async () => {
    const executor = new FakeExecutor(outcome());
    const storage = new FakeStorage();
    const jobs = new FakeJobs();

    const out = await executeRender(input, deps(executor, storage, jobs));

    expect(out.cacheHit).toBe(false);
    expect(storage.puts).toHaveLength(2);
    expect(out.job.artifacts.map((a) => a.kind)).toEqual(["RENDER_PDF", "RENDER_PNG"]);
    expect(out.job.state).toBe("DONE");
  });

  it("o storage grava **antes** do banco", async () => {
    // Inverter criaria linha apontando para chave que não existe, e uma linha assim é pior que
    // nenhuma: a interface acha que tem PDF e o download falha.
    const storage = new FakeStorage();
    const jobs = new FakeJobs();
    const ordem: string[] = [];

    // Espalhar a instância perderia os métodos do protótipo — em classe eles não são propriedades
    // próprias. Delegar explicitamente é o que mantém o dublê sendo um `StorageProvider`.
    const spied: StorageProvider = {
      put: async (i) => {
        ordem.push("storage");
        return storage.put(i);
      },
      get: (k) => storage.get(k),
      exists: (k) => storage.exists(k),
      delete: (k) => storage.delete(k),
    };
    const spiedJobs: RenderJobRepository = {
      findByContentHash: (w, h) => jobs.findByContentHash(w, h),
      create: async (j) => {
        ordem.push("banco");
        return jobs.create(j);
      },
      remove: (id) => jobs.remove(id),
    };

    await executeRender(input, {
      executor: new FakeExecutor(outcome()),
      storage: spied,
      jobs: spiedJobs,
      rendererVersion: "1.0",
    });

    expect(ordem).toEqual(["storage", "storage", "banco"]);
  });

  it("guarda o hash **do storage**, não o do worker", async () => {
    // É o que garante que o registro descreve o que foi gravado, e não o que se esperava gravar.
    const out = await executeRender(
      input,
      deps(new FakeExecutor(outcome()), new FakeStorage(), new FakeJobs()),
    );

    expect(out.job.artifacts[0]?.sha256.startsWith("storage-")).toBe(true);
  });

  it("segunda chamada com a mesma entrada não compila de novo", async () => {
    const executor = new FakeExecutor(outcome());
    const storage = new FakeStorage();
    const jobs = new FakeJobs();
    const d = deps(executor, storage, jobs);

    await executeRender(input, d);
    const second = await executeRender(input, d);

    expect(second.cacheHit).toBe(true);
    expect(executor.calls).toBe(1);
    expect(storage.puts).toHaveLength(2);
  });

  it("entrada diferente compila de novo", async () => {
    const executor = new FakeExecutor(outcome());
    const d = deps(executor, new FakeStorage(), new FakeJobs());

    await executeRender(input, d);
    await executeRender({ ...input, bundle: bundle({ sourceLatex: "outro" }) }, d);

    expect(executor.calls).toBe(2);
  });

  it("versão nova do renderer invalida o cache", async () => {
    // Subir a imagem com um TeX Live novo muda a saída sem mudar o documento.
    const executor = new FakeExecutor(outcome());
    const storage = new FakeStorage();
    const jobs = new FakeJobs();

    await executeRender(input, { executor, storage, jobs, rendererVersion: "1.0" });
    const depois = await executeRender(input, { executor, storage, jobs, rendererVersion: "2.0" });

    expect(depois.cacheHit).toBe(false);
    expect(executor.calls).toBe(2);
  });

  it("outro workspace não reaproveita o artefato", async () => {
    // Coincidência de conteúdo entre duas bibliotecas do mesmo dono é o caso comum, não o raro.
    const executor = new FakeExecutor(outcome());
    const d = deps(executor, new FakeStorage(), new FakeJobs());

    await executeRender(input, d);
    const outro = await executeRender({ ...input, workspaceId: "w2" }, d);

    expect(outro.cacheHit).toBe(false);
  });

  it("falha do documento também entra no cache", async () => {
    // Recompilar o mesmo LaTeX quebrado dá o mesmo erro; gastar `pdflatex` para reconfirmar é
    // desperdício que a pessoa sente.
    const executor = new FakeExecutor({
      result: result({ success: false, failureKind: "document", pdf: null, png: [] }),
      artifacts: new Map(),
    });
    const d = deps(executor, new FakeStorage(), new FakeJobs());

    const first = await executeRender(input, d);
    const second = await executeRender(input, d);

    expect(first.job.state).toBe("FAILED");
    expect(second.cacheHit).toBe(true);
    expect(executor.calls).toBe(1);
  });

  it.each(["timeout", "worker"] as const)(
    "falha de %s não entra no cache — a próxima compilação tenta de novo",
    async (failureKind) => {
      // O 1º render de uma questão pesada coincide com a montagem do formato e passa do prazo; o
      // /tmp do contêiner enche. Nenhum dos dois é do documento, e guardá-los respondia "passou
      // de 30000 ms" para aquele LaTeX, instantaneamente, para sempre.
      const executor = new FakeExecutor({
        result: result({ success: false, failureKind, pdf: null, png: [] }),
        artifacts: new Map(),
      });
      const jobs = new FakeJobs();
      const d = deps(executor, new FakeStorage(), jobs);

      const first = await executeRender(input, d);
      const second = await executeRender(input, d);

      expect(first.job.state).toBe("FAILED");
      expect(second.cacheHit).toBe(false);
      expect(executor.calls).toBe(2);
      expect(jobs.created).toHaveLength(0);
    },
  );

  it("job cujo artefato sumiu do storage não é cache — recompila e substitui", async () => {
    // "O artefato foi descartado do storage. Recompile" só é conselho se recompilar recompila.
    const executor = new FakeExecutor(outcome());
    const storage = new FakeStorage();
    const jobs = new FakeJobs();
    const d = deps(executor, storage, jobs);

    const first = await executeRender(input, d);
    storage.gone.add(first.job.artifacts[0]?.storageKey ?? "");
    const second = await executeRender(input, d);

    expect(second.cacheHit).toBe(false);
    expect(executor.calls).toBe(2);
    expect(second.job.id).not.toBe(first.job.id);
    expect((await executeRender(input, d)).job.id).toBe(second.job.id);
  });

  it("`force` recompila mesmo com cache, e o novo job passa a ser o cache", async () => {
    const executor = new FakeExecutor(outcome());
    const d = deps(executor, new FakeStorage(), new FakeJobs());

    const first = await executeRender(input, d);
    const forced = await executeRender({ ...input, force: true }, d);

    expect(forced.cacheHit).toBe(false);
    expect(executor.calls).toBe(2);
    expect((await executeRender(input, d)).job.id).toBe(forced.job.id);
    expect(forced.job.id).not.toBe(first.job.id);
  });

  it("a versão vem de quem compila: a imagem reconstruída invalida o cache sem bump manual", async () => {
    // Acrescentar um pacote ao Dockerfile e rodar `docker compose build` sem mexer em
    // RENDERER_VERSION: a versão que o worker reporta muda, e é ela que entra no hash.
    const executor = new FakeExecutor(outcome());
    const storage = new FakeStorage();
    const jobs = new FakeJobs();
    let reported = "0.0.0-dev+aaaa";
    const d = { executor, storage, jobs, rendererVersion: () => Promise.resolve(reported) };

    await executeRender(input, d);
    reported = "0.0.0-dev+bbbb";
    const depois = await executeRender(input, d);

    expect(depois.cacheHit).toBe(false);
    expect(executor.calls).toBe(2);
  });

  it("job sem PDF não grava artefato nenhum", async () => {
    const storage = new FakeStorage();
    await executeRender(input, {
      executor: new FakeExecutor({
        result: result({ success: false, pdf: null, png: [] }),
        artifacts: new Map(),
      }),
      storage,
      jobs: new FakeJobs(),
      rendererVersion: "1.0",
    });

    expect(storage.puts).toHaveLength(0);
  });

  it("preserva a ordem das páginas", async () => {
    // `page-1`, `page-2`… é a paginação do documento; perder a ordem embaralharia a leitura.
    const executor = new FakeExecutor({
      result: result({
        png: [
          {
            name: "page-1.png",
            mimeType: "image/png",
            sizeBytes: 1,
            sha256: "a".repeat(64),
            width: 1,
            height: 1,
          },
          {
            name: "page-2.png",
            mimeType: "image/png",
            sizeBytes: 1,
            sha256: "b".repeat(64),
            width: 1,
            height: 1,
          },
        ],
      }),
      artifacts: new Map([
        ["main.pdf", new Uint8Array([1])],
        ["page-1.png", new Uint8Array([2])],
        ["page-2.png", new Uint8Array([3])],
      ]),
    });

    const out = await executeRender(input, deps(executor, new FakeStorage(), new FakeJobs()));
    expect(out.job.artifacts.map((a) => a.name)).toEqual(["main.pdf", "page-1.png", "page-2.png"]);
  });
});
