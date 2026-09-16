import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { DEFAULT_RENDER_OPTIONS, validateRenderBundle } from "@latexbookbank/render-contract";

import { assetLatexName } from "@modules/assets/domain/asset-latex-name";
import {
  resolveLegacyFigures,
  storeLegacyFigure,
} from "@modules/legacy-import/application/import-legacy-figures";
import { mapLegacyLibrary } from "@modules/legacy-import/application/map-legacy-library";
import { rewriteLegacyAssetRefs } from "@modules/legacy-import/domain/legacy-asset-refs";
import {
  LEGACY_FIGURE_ASSET_KIND,
  legacyFigureLatexName,
  legacyFigureMimeType,
  type LegacyFileReader,
} from "@modules/legacy-import/domain/legacy-figures";
import type {
  LegacyLibraryContents,
  RawLegacyOptionRow,
  RawLegacyQuestionRow,
} from "@modules/legacy-import/domain/legacy-library-reader";
import { buildRenderBundle } from "@modules/rendering/domain/build-render-bundle";
import { citedAssets } from "@modules/rendering/domain/cited-assets";
import { QUESTION_PREVIEW_PROFILE } from "@modules/rendering/domain/latex-profile";
import {
  AssetNotFoundError,
  asStorageKey,
  type PutAssetInput,
  type StorageKey,
  type StorageProvider,
  type StoredAsset,
  type StoredContent,
} from "@/shared/ports";

/**
 * A figura legada precisa chegar ao `pdflatex` **pelo nome que o LaTeX cita**.
 *
 * O acervo grava `\includegraphics{images/clipboard_<ts>.png}`; o bundle recusa nome com barra
 * e o montador só leva o asset cujo `assetLatexName` aparece no corpo. Estes testes fecham o
 * circuito de ponta a ponta sem banco: do disco falso ao manifesto do bundle, passando pela
 * reescrita do texto — se qualquer elo nomear diferente, a figura fica gravada e nunca viaja.
 *
 * Ver checklist Fase 11, bloco "Figuras de questão → `Asset`" · #173.
 */

const question = (over: Partial<RawLegacyQuestionRow> = {}): RawLegacyQuestionRow => ({
  IdQuestao: 1,
  IdQuestao_Pai: null,
  // Discursiva: não exige gabarito, então a invariante de múltipla escolha não exclui a fixture.
  TipoQuestao: 1,
  idPublication: 1,
  Apelido: null,
  latexQuestao: null,
  latexResposta: null,
  latexOrigin: null,
  Dificuldade: 5,
  Numeracao: 0,
  Numeracao_Original: 0,
  Ano: null,
  ...over,
});

const option = (over: Partial<RawLegacyOptionRow> = {}): RawLegacyOptionRow => ({
  IdQuestao_Itens: 1,
  IdQuestao: 1,
  Ordem: 1,
  Marcacao: "a",
  Correta: 0,
  latexOrigin: null,
  latexItem: null,
  latexResposta: null,
  ...over,
});

const contents = (
  questions: readonly RawLegacyQuestionRow[],
  options: readonly RawLegacyOptionRow[] = [],
): LegacyLibraryContents => ({
  capabilities: {
    generation: "latex_complemento",
    hasComplemento: true,
    hasTagConhecimento: true,
    hasBanca: true,
    hasMigrationsTable: true,
  },
  publications: [{
    idPublication: 1,
    PublicationName: "Livro",
    UUID: null,
    ISBN: null,
    AuthorSort: null,
    PublicationNick: null,
    PublicationSeries: null,
    Notes: null,
  }],
  questions,
  options,
});

/** Um PNG mínimo com `IHDR` válido — o bastante para o `storeAsset` ler as dimensões. */
function png(seed: number, width = 3, height = 2): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0, 0, 0, 13], 8);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes[29] = seed;
  return bytes;
}

const sha = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

/** Disco de mentira: só os caminhos listados existem, e cada um tem os bytes dados. */
const fakeDisk = (entries: Readonly<Record<string, Uint8Array>>): LegacyFileReader => ({
  exists: async (path) => path in entries,
  readFile: async (path) => {
    const bytes = entries[path];
    if (bytes === undefined) throw new Error(`fake disk: ${path} não existe`);
    return bytes;
  },
});

/** Storage em memória, com a mesma chave endereçada por hash do provider local. */
class MemoryStorage implements StorageProvider {
  readonly objects = new Map<string, { bytes: Uint8Array; mimeType: string }>();

  async put(input: PutAssetInput): Promise<StoredAsset> {
    const digest = sha(input.content);
    const key = asStorageKey(`${input.workspaceId}/${digest.slice(0, 2)}/${digest}`);
    this.objects.set(key, { bytes: input.content, mimeType: input.mimeType });
    return { storageKey: key, sha256: digest, sizeBytes: input.content.byteLength };
  }

  async get(key: StorageKey): Promise<StoredContent> {
    const found = this.objects.get(key);
    if (found === undefined) throw new AssetNotFoundError(key);
    return { content: found.bytes, mimeType: found.mimeType, sizeBytes: found.bytes.byteLength };
  }

  async exists(key: StorageKey): Promise<boolean> {
    return this.objects.has(key);
  }

  async delete(key: StorageKey): Promise<void> {
    this.objects.delete(key);
  }
}

const LIB = "/acervo/Fundamentos";
const FIG_A = png(1);
const FIG_B = png(2);
const REF_A = "images/clipboard_2023.10.12.22.23.665553.png";
const REF_B = "images/clipboard_2023.10.12.22.30.227185.png";
const DISK = {
  [`${LIB}/pub0000000001/idQuestion9/${REF_A}`]: FIG_A,
  [`${LIB}/pub0000000001/idQuestion10/${REF_B}`]: FIG_B,
};

const NAME_A = assetLatexName({
  sha256: sha(FIG_A),
  mimeType: "image/png",
  originalFilename: "clipboard_2023.10.12.22.23.665553.png",
});

describe("o nome e o tipo da figura legada", () => {
  it("é o mesmo `assetLatexName` da Fase 14 — nome do arquivo, sem `images/`, com o hash", () => {
    expect(legacyFigureLatexName(`${LIB}/pub0000000001/idQuestion9/${REF_A}`, sha(FIG_A), "image/png"))
      .toBe(NAME_A);
    expect(NAME_A).toBe(`clipboard-2023-10-12-22-23-665553-${sha(FIG_A).slice(0, 8)}.png`);
  });

  it("aceita png, jpg e pdf; recusa o resto em vez de gravar torto", () => {
    expect(legacyFigureMimeType("images/a.PNG")).toBe("image/png");
    expect(legacyFigureMimeType("images/a.jpeg")).toBe("image/jpeg");
    expect(legacyFigureMimeType("figura.pdf")).toBe("application/pdf");
    expect(legacyFigureMimeType("figura.eps")).toBeNull();
    expect(legacyFigureMimeType("sem-extensao")).toBeNull();
  });

  it("figura em uso na questão é `QUESTION_IMAGE`, não `SOURCE_IMAGE`", () => {
    expect(LEGACY_FIGURE_ASSET_KIND).toBe("QUESTION_IMAGE");
  });
});

describe("rewriteLegacyAssetRefs", () => {
  const renames = new Map([[REF_A, NAME_A]]);

  it("troca só o argumento — opções, `\\r` e o resto do texto ficam como estavam", () => {
    const latex = `Veja:\n\\includegraphics[width=0.95\\linewidth]{${REF_A}}\r\nFim.`;
    expect(rewriteLegacyAssetRefs(latex, renames)).toBe(
      `Veja:\n\\includegraphics[width=0.95\\linewidth]{${NAME_A}}\r\nFim.`,
    );
  });

  it("casa o caminho como o legado escreveu: `./` e barra do Windows também", () => {
    expect(rewriteLegacyAssetRefs(`\\includegraphics{./${REF_A}}`, renames)).toBe(
      `\\includegraphics{${NAME_A}}`,
    );
    expect(rewriteLegacyAssetRefs(`\\includegraphics{${REF_A.replace(/\//g, "\\")}}`, renames))
      .toBe(`\\includegraphics{${NAME_A}}`);
  });

  it("deixa intocado o que não está no mapa, e é idempotente", () => {
    const outro = `\\includegraphics{${REF_B}}`;
    expect(rewriteLegacyAssetRefs(outro, renames)).toBe(outro);

    const once = rewriteLegacyAssetRefs(`\\includegraphics{${REF_A}}`, renames);
    expect(rewriteLegacyAssetRefs(once, renames)).toBe(once);
  });
});

describe("resolveLegacyFigures", () => {
  const library = contents(
    [
      question({
        IdQuestao: 9,
        latexResposta: `\\includegraphics[width=0.95\\linewidth]{${REF_A}}\r`,
      }),
      question({ IdQuestao: 10, latexQuestao: "Sem figura" }),
      question({ IdQuestao: 11, latexQuestao: "\\includegraphics{images/perdida.png}" }),
      question({ IdQuestao: 12, latexQuestao: "\\includegraphics{../fora.png}" }),
    ],
    [
      // Alternativa da 10 cita a figura, que mora na pasta da questão dona (Fundamentos 10, itens 6–7).
      option({ IdQuestao_Itens: 6, IdQuestao: 10, latexResposta: `\\includegraphics{${REF_B}}` }),
      option({ IdQuestao_Itens: 7, IdQuestao: 10, latexResposta: `\\includegraphics{${REF_B}}` }),
    ],
  );

  it("lê a figura da pasta da questão dona, calcula o hash e o nome que o LaTeX vai citar", async () => {
    const resolution = await resolveLegacyFigures(library, fakeDisk(DISK), { libraryDir: LIB });

    expect(resolution.figures.map((f) => [f.legacyQuestionId, f.relativePath, f.latexName])).toEqual([
      [9, REF_A, NAME_A],
      [10, REF_B, legacyFigureLatexName(REF_B, sha(FIG_B), "image/png")],
    ]);
    expect(resolution.figures[0]).toMatchObject({
      idPublication: 1,
      sourcePath: `pub0000000001/idQuestion9/${REF_A}`,
      sha256: sha(FIG_A),
      mimeType: "image/png",
      originalFilename: "clipboard_2023.10.12.22.23.665553.png",
      field: "latexResposta",
    });
    // A figura citada por duas alternativas é um arquivo só — e o campo é o da primeira citação.
    expect(resolution.figures[1]?.field).toBe("Questao_Itens.6.latexResposta");
    expect(resolution.renamesByQuestion.get(10)?.get(REF_B)).toBe(resolution.figures[1]?.latexName);
  });

  it("reporta o que não dá para trazer, com a mesma razão do relatório de ausentes", async () => {
    const resolution = await resolveLegacyFigures(library, fakeDisk(DISK), { libraryDir: LIB });

    expect(resolution.skipped).toEqual([
      { legacyQuestionId: 11, field: "latexQuestao", ref: "images/perdida.png", reason: "arquivo-ausente" },
      { legacyQuestionId: 12, field: "latexQuestao", ref: "../fora.png", reason: "caminho-escapa-da-pasta" },
    ]);
  });

  it("formato que o produto não guarda como figura vira `formato-nao-suportado`", async () => {
    const eps = contents([question({ IdQuestao: 9, latexQuestao: "\\includegraphics{images/g.eps}" })]);
    const resolution = await resolveLegacyFigures(
      eps,
      fakeDisk({ [`${LIB}/pub0000000001/idQuestion9/images/g.eps`]: png(3) }),
      { libraryDir: LIB },
    );

    expect(resolution.figures).toEqual([]);
    expect(resolution.skipped[0]?.reason).toBe("formato-nao-suportado");
  });

  it("sem extensão, acha o arquivo como o `graphicx` acharia — e nomeia pelo arquivo real", async () => {
    const semExt = contents([question({ IdQuestao: 9, latexQuestao: "\\includegraphics{images/g}" })]);
    const resolution = await resolveLegacyFigures(
      semExt,
      fakeDisk({ [`${LIB}/pub0000000001/idQuestion9/images/g.png`]: FIG_A }),
      { libraryDir: LIB },
    );

    expect(resolution.figures[0]).toMatchObject({
      relativePath: "images/g",
      sourcePath: "pub0000000001/idQuestion9/images/g.png",
      latexName: `g-${sha(FIG_A).slice(0, 8)}.png`,
    });
  });
});

describe("storeLegacyFigure", () => {
  it("sobe pelo mesmo caminho do upload e devolve o registro pronto para virar `Asset`", async () => {
    const storage = new MemoryStorage();
    const resolution = await resolveLegacyFigures(
      contents([question({ IdQuestao: 9, latexResposta: `\\includegraphics{${REF_A}}` })]),
      fakeDisk(DISK),
      { libraryDir: LIB },
    );

    const record = await storeLegacyFigure(resolution.figures[0]!, storage, "ws-1");

    expect(record).toMatchObject({
      kind: "QUESTION_IMAGE",
      sha256: sha(FIG_A),
      mimeType: "image/png",
      originalFilename: "clipboard_2023.10.12.22.23.665553.png",
      sizeBytes: FIG_A.byteLength,
      width: 3,
      height: 2,
    });
    expect(await storage.exists(asStorageKey(record.storageKey))).toBe(true);
    expect((await storage.get(asStorageKey(record.storageKey))).content).toEqual(FIG_A);
  });

  it("para se o storage devolver outro hash — o nome já está no LaTeX", async () => {
    const storage = new MemoryStorage();
    const resolution = await resolveLegacyFigures(
      contents([question({ IdQuestao: 9, latexResposta: `\\includegraphics{${REF_A}}` })]),
      fakeDisk(DISK),
      { libraryDir: LIB },
    );
    const adulterada = { ...resolution.figures[0]!, sha256: "0".repeat(64) };

    await expect(storeLegacyFigure(adulterada, storage, "ws-1")).rejects.toThrow(/discordam/);
  });
});

describe("mapLegacyLibrary com figuras", () => {
  const library = contents(
    [
      question({ IdQuestao: 9, latexResposta: `Veja \\includegraphics[width=0.5\\linewidth]{${REF_A}}` }),
      question({ IdQuestao: 10, latexQuestao: "Qual?", latexOrigin: `\\includegraphics{${REF_B}}` }),
      // Nó estrutural que cita figura (Fundamentos 11): não vira questão, e a figura precisa ser reportada.
      question({ IdQuestao: 11, TipoQuestao: -1, Apelido: "Grupo", latexResposta: `\\includegraphics{${REF_B}}` }),
    ],
    [
      option({ IdQuestao_Itens: 6, IdQuestao: 10, Correta: 1, latexResposta: `\\includegraphics{${REF_B}}` }),
    ],
  );
  const disk = {
    ...DISK,
    [`${LIB}/pub0000000001/idQuestion11/${REF_B}`]: FIG_B,
  };

  it("reescreve enunciado, resposta e alternativas, e lista o `sha256` em `assets`", async () => {
    const figures = await resolveLegacyFigures(library, fakeDisk(disk), { libraryDir: LIB });
    const mapping = mapLegacyLibrary(library, { workspaceName: "F", workspaceSlug: "f", figures });

    const nodes = mapping.portable.publications[0]!.nodes;
    const q9 = nodes.find((n) => n.legacyId === 9)!.question!;
    const q10 = nodes.find((n) => n.legacyId === 10)!.question!;

    expect(q9.solutionLatex).toBe(`Veja \\includegraphics[width=0.5\\linewidth]{${NAME_A}}`);
    expect(q9.assets).toEqual([sha(FIG_A)]);

    const nameB = figures.renamesByQuestion.get(10)!.get(REF_B)!;
    expect(q10.options[0]!.solutionLatex).toBe(`\\includegraphics{${nameB}}`);
    expect(q10.assets).toEqual([sha(FIG_B)]);
    // `originalLatex` é proveniência: fica como veio, mesmo citando a figura.
    expect(q10.originalLatex).toBe(`\\includegraphics{${REF_B}}`);
  });

  it("figura de nó estrutural fica sem dona — e aparece no relatório em vez de sumir", async () => {
    const figures = await resolveLegacyFigures(library, fakeDisk(disk), { libraryDir: LIB });
    const mapping = mapLegacyLibrary(library, { workspaceName: "F", workspaceSlug: "f", figures });

    expect(mapping.unattachedFigures).toEqual([
      { legacyQuestionId: 11, relativePath: REF_B, reason: "no-estrutural" },
    ]);
  });

  it("sem figuras, é o mapeamento de antes: texto como veio e `assets: []`", () => {
    const mapping = mapLegacyLibrary(library, { workspaceName: "F", workspaceSlug: "f" });
    const q9 = mapping.portable.publications[0]!.nodes.find((n) => n.legacyId === 9)!.question!;

    expect(q9.solutionLatex).toContain(REF_A);
    expect(q9.assets).toEqual([]);
    expect(mapping.unattachedFigures).toEqual([]);
  });
});

describe("a figura importada chega ao bundle", () => {
  it("o corpo reescrito cita o nome que o montador calcula, e o manifesto passa na validação do contrato", async () => {
    const library = contents([
      question({ IdQuestao: 9, latexResposta: `\\includegraphics[width=0.95\\linewidth]{${REF_A}}` }),
    ]);
    const storage = new MemoryStorage();
    const figures = await resolveLegacyFigures(library, fakeDisk(DISK), { libraryDir: LIB });
    const mapping = mapLegacyLibrary(library, { workspaceName: "F", workspaceSlug: "f", figures });
    const q9 = mapping.portable.publications[0]!.nodes[0]!.question!;

    // O que o writer/backfill grava na linha de `Asset` — o mesmo registro que o storage devolve.
    const record = await storeLegacyFigure(figures.figures[0]!, storage, "ws-1");
    const assetRow = {
      kind: record.kind,
      sha256: record.sha256,
      mimeType: record.mimeType,
      originalFilename: record.originalFilename,
      sizeBytes: record.sizeBytes,
    };

    const withoutAssets = buildRenderBundle({
      jobId: "job-1",
      profile: QUESTION_PREVIEW_PROFILE,
      includeSolution: true,
      question: {
        id: "q-9",
        type: q9.type,
        statementLatex: q9.statementLatex,
        solutionLatex: q9.solutionLatex,
        complementLatex: q9.complementLatex,
        options: [],
      },
    });

    const cited = citedAssets([assetRow], withoutAssets.sourceLatex);
    expect(cited.map((c) => c.name)).toEqual([NAME_A]);

    const bundle = buildRenderBundle({
      jobId: "job-1",
      profile: QUESTION_PREVIEW_PROFILE,
      includeSolution: true,
      question: { id: "q-9", type: q9.type, statementLatex: q9.statementLatex, solutionLatex: q9.solutionLatex, complementLatex: q9.complementLatex, options: [] },
      assets: cited.map(({ name, asset }) => ({
        name,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
        sha256: asset.sha256,
      })),
      options: DEFAULT_RENDER_OPTIONS,
    });

    expect(() => validateRenderBundle(bundle)).not.toThrow();
    expect(bundle.sourceLatex).toContain(`\\includegraphics[width=0.95\\linewidth]{${NAME_A}}`);
    expect(bundle.sourceLatex).not.toContain("images/");
  });

  it("sem a reescrita, o mesmo asset não viaja — é o `File not found` que a pendência descreve", () => {
    const assetRow = {
      kind: "QUESTION_IMAGE",
      sha256: sha(FIG_A),
      mimeType: "image/png",
      originalFilename: "clipboard_2023.10.12.22.23.665553.png",
      sizeBytes: FIG_A.byteLength,
    };
    expect(citedAssets([assetRow], `\\includegraphics{${REF_A}}`)).toEqual([]);
  });
});
