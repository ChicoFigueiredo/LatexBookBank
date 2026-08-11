import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import type { RenderBundle, RenderResult } from "@latexbookbank/render-contract";

import { executeRender } from "@modules/rendering/application/execute-render";
import { isAssetKind, isDerivedAsset, isSourceAsset } from "@modules/assets/domain/asset-kind";
import { classifyAsset } from "@modules/legacy-import/domain/legacy-mapping";
import { createLogger } from "@/shared/observability/logger";
import type {
  NewRenderJob,
  RenderJobRecord,
  RenderJobRepository,
} from "@modules/rendering/domain/render-job";
import {
  asStorageKey,
  type PutAssetInput,
  type RenderExecutor,
  type RenderOutcome,
  type StorageKey,
  type StorageProvider,
  type StoredAsset,
} from "@/shared/ports";

/**
 * **Render é derivado, e derivado é descartável** (D29 · auditoria §41).
 *
 * As três afirmações da fase dizem isso por ângulos diferentes: o artefato pode sumir e voltar
 * igual, nada do render vira patrimônio, e o `preview.png` do legado nunca é conteúdo da questão.
 *
 * Ver spec §12 · D29 · issue #153.
 */

/**
 * Storage endereçado por conteúdo, como o de verdade.
 *
 * O fake antigo numerava as chaves (`storage-1`, `storage-2`), e com ele "reconstruir dá o mesmo"
 * seria impossível de afirmar — a segunda gravação teria outra chave por construção do teste, não
 * por propriedade do sistema. O `LocalFileStorageProvider` põe o sha256 na chave; este faz igual.
 */
class ContentAddressedStorage implements StorageProvider {
  readonly puts: PutAssetInput[] = [];

  async put(input: PutAssetInput): Promise<StoredAsset> {
    this.puts.push(input);
    const sha256 = createHash("sha256").update(input.content).digest("hex");

    return {
      storageKey: asStorageKey(`${input.workspaceId}/${sha256.slice(0, 2)}/${sha256}`),
      sha256,
      sizeBytes: input.content.byteLength,
    };
  }
  async get(_key: StorageKey): Promise<never> {
    throw new Error("não usado");
  }
  async exists(_key: StorageKey) {
    return true;
  }
  async delete(_key: StorageKey) {
    /* não usado */
  }
}

class DiscardableJobs implements RenderJobRepository {
  readonly created: NewRenderJob[] = [];
  private byHash = new Map<string, RenderJobRecord>();

  async findByContentHash(workspaceId: string, hash: string): Promise<RenderJobRecord | null> {
    return this.byHash.get(`${workspaceId}/${hash}`) ?? null;
  }

  async create(job: NewRenderJob): Promise<RenderJobRecord> {
    this.created.push(job);
    const record: RenderJobRecord = { ...job, id: `id-${this.created.length}` };
    this.byHash.set(`${job.workspaceId}/${job.contentHash}`, record);
    return record;
  }

  /** O descarte que a D29 permite: some tudo, e o produto continua íntegro. */
  discardEverything(): void {
    this.byHash = new Map();
  }
}

class SteadyExecutor implements RenderExecutor {
  calls = 0;

  async render(): Promise<RenderOutcome> {
    this.calls += 1;
    return {
      result: {
        jobId: "j",
        success: true,
        pdf: {
          name: "main.pdf",
          mimeType: "application/pdf",
          sizeBytes: 3,
          sha256: "a",
          width: null,
          height: null,
        },
        png: [
          {
            name: "page-1.png",
            mimeType: "image/png",
            sizeBytes: 2,
            sha256: "b",
            width: 100,
            height: 200,
          },
        ],
        diagnostics: [],
        stdout: "",
        stderr: "",
        durationMs: 10,
        rendererVersion: "teste-1",
      } as RenderResult,
      artifacts: new Map([
        ["main.pdf", new Uint8Array([1, 2, 3])],
        ["page-1.png", new Uint8Array([4, 5])],
      ]),
    };
  }
  async cancel(): Promise<void> {
    /* não usado */
  }
  async health() {
    return { status: "ok" } as never;
  }
}

const bundle = (): RenderBundle => ({
  jobId: "job-1",
  sourceLatex: "Calcule $2+2$.",
  profile: {
    id: "question-preview",
    documentClass: "article",
    documentClassOptions: [],
    preamble: ["\\usepackage{amsmath}"],
    engine: "pdflatex",
  },
  assets: [],
  options: { dpi: 110, timeoutMs: 20_000, passes: 1 },
});

const deps = (
  jobs: DiscardableJobs,
  storage: ContentAddressedStorage,
  executor: SteadyExecutor,
) => ({
  executor,
  storage,
  jobs,
  rendererVersion: "teste-1",
});

describe("o artefato pode ser descartado e reconstruído", () => {
  it("depois do descarte, recompilar dá **as mesmas chaves de storage**", async () => {
    // É o que "reconstruível" significa na prática: o artefato não é patrimônio, e apagá-lo custa
    // uma recompilação — não um dado perdido.
    const jobs = new DiscardableJobs();
    const storage = new ContentAddressedStorage();
    const executor = new SteadyExecutor();

    const first = await executeRender(
      { workspaceId: "w", questionId: "q", bundle: bundle() },
      deps(jobs, storage, executor),
    );

    jobs.discardEverything();

    const second = await executeRender(
      { workspaceId: "w", questionId: "q", bundle: bundle() },
      deps(jobs, storage, executor),
    );

    expect(second.cacheHit).toBe(false);
    expect(executor.calls).toBe(2);
    expect(second.job.contentHash).toBe(first.job.contentHash);
    expect(second.job.artifacts.map((a) => a.storageKey)).toEqual(
      first.job.artifacts.map((a) => a.storageKey),
    );
    expect(second.job.artifacts.map((a) => a.sha256)).toEqual(
      first.job.artifacts.map((a) => a.sha256),
    );
  });

  it("sem descartar, não recompila — senão o cache não seria cache", async () => {
    // Controle: sem isto, o teste acima passaria mesmo que o cache nunca funcionasse.
    const jobs = new DiscardableJobs();
    const executor = new SteadyExecutor();

    await executeRender(
      { workspaceId: "w", questionId: "q", bundle: bundle() },
      deps(jobs, new ContentAddressedStorage(), executor),
    );
    const again = await executeRender(
      { workspaceId: "w", questionId: "q", bundle: bundle() },
      deps(jobs, new ContentAddressedStorage(), executor),
    );

    expect(again.cacheHit).toBe(true);
    expect(executor.calls).toBe(1);
  });
});

describe("nada do render vira patrimônio", () => {
  it("todo artefato gravado tem tipo **derivado**", async () => {
    const jobs = new DiscardableJobs();

    const { job } = await executeRender(
      { workspaceId: "w", questionId: "q", bundle: bundle() },
      deps(jobs, new ContentAddressedStorage(), new SteadyExecutor()),
    );

    expect(job.artifacts.length).toBeGreaterThan(0);
    for (const artifact of job.artifacts) {
      expect(isAssetKind(artifact.kind) && isDerivedAsset(artifact.kind)).toBe(true);
      expect(isAssetKind(artifact.kind) && isSourceAsset(artifact.kind)).toBe(false);
    }
  });

  it("os dois conjuntos não se sobrepõem — senão a afirmação acima seria vazia", () => {
    expect(isSourceAsset("RENDER_PNG")).toBe(false);
    expect(isDerivedAsset("SOURCE_PDF")).toBe(false);
    expect(isSourceAsset("SOURCE_PDF")).toBe(true);
  });
});

describe("o caminho do render é instrumentado", () => {
  const capture = () => {
    const lines: string[] = [];
    return {
      lines,
      logger: createLogger({ write: (line) => lines.push(line), minLevel: "debug" }),
    };
  };

  const events = (lines: readonly string[]) =>
    lines.map(
      (line) =>
        JSON.parse(line) as {
          domain: string;
          event: string;
          fields: Record<string, unknown>;
        },
    );

  it("compilar registra `started` e `finished`, no domínio `render`", async () => {
    const { lines, logger } = capture();

    await executeRender(
      { workspaceId: "w", questionId: "q", bundle: bundle() },
      {
        ...deps(new DiscardableJobs(), new ContentAddressedStorage(), new SteadyExecutor()),
        logger,
      },
    );

    const seen = events(lines);
    expect(seen.map((e) => e.event)).toEqual(["started", "finished"]);
    expect(seen.every((e) => e.domain === "render")).toBe(true);
  });

  it("cache registra `cache_hit`, e **não** finge que compilou", async () => {
    // Sem distinguir os dois, o log diria que o worker rodou toda vez — e a primeira pergunta que
    // se faz a um log de render é justamente "quanto disso é cache?".
    const jobs = new DiscardableJobs();
    const storage = new ContentAddressedStorage();
    const executor = new SteadyExecutor();

    await executeRender(
      { workspaceId: "w", questionId: "q", bundle: bundle() },
      deps(jobs, storage, executor),
    );

    const { lines, logger } = capture();
    await executeRender(
      { workspaceId: "w", questionId: "q", bundle: bundle() },
      { ...deps(jobs, storage, executor), logger },
    );

    expect(events(lines).map((e) => e.event)).toEqual(["cache_hit"]);
  });

  it("**o LaTeX não vai para o log** — só o hash abreviado", async () => {
    // Spec §14: o enunciado de uma prova não tem por que existir em duas cópias, uma delas fora
    // do banco. O hash serve para correlacionar, que é o para que o log existe.
    const { lines, logger } = capture();

    await executeRender(
      { workspaceId: "w", questionId: "q", bundle: bundle() },
      {
        ...deps(new DiscardableJobs(), new ContentAddressedStorage(), new SteadyExecutor()),
        logger,
      },
    );

    for (const line of lines) {
      expect(line).not.toContain("Calcule");
      expect(line).not.toContain("2+2");
    }
    expect(String(events(lines)[0]?.fields["hash"])).toHaveLength(12);
  });
});

describe("`preview.png` nunca vira conteúdo canônico", () => {
  it("o classificador do legado o recusa", () => {
    // É cache de render do produto antigo. Importá-lo faria o produto novo carregar,
    // como patrimônio, o derivado que ele mesmo sabe reconstruir.
    expect(classifyAsset("preview.png")).toBeNull();
    expect(classifyAsset("PREVIEW.PNG")).toBeNull();
  });

  it("mas uma figura de verdade com nome parecido **entra**", () => {
    // Sem este controle, um classificador que recusasse tudo passaria no teste acima.
    expect(classifyAsset("preview-da-questao.png")).not.toBeNull();
    expect(classifyAsset("figura.png")).not.toBeNull();
  });
});
