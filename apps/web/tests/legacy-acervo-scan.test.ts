import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { scanLegacyAcervo } from "@modules/legacy-import/application/scan-legacy-acervo";
import { relativeAcervoPath, type LegacyConfigReader, type LegacyLibraryRow } from "@modules/legacy-import/domain/legacy-config";
import { NodeLegacyFsProbe } from "@modules/legacy-import/infrastructure/node-legacy-fs-probe";

/**
 * O scanner confia no `padrao.knowchicoconfig`, não numa varredura de pastas — é isso que faz
 * `ITA/` (só `Material`, apostilas de terceiros) e `_Antigos/` (cópias desatualizadas com
 * biblioteca corrente já registrada) ficarem de fora sem precisar de caso especial.
 *
 * O leitor do config é `bun:sqlite`, que não existe sob o Vitest — aqui ele é uma fake. O probe de
 * filesystem é o de verdade (`node:fs`), contra uma pasta temporária real.
 */

describe("relativeAcervoPath", () => {
  it("acha o marcador entre barras invertidas", () => {
    expect(relativeAcervoPath("T:\\KnowChico\\Provas\\ENEM", "KnowChico")).toBe("Provas/ENEM");
  });

  it("acha o marcador entre barras normais", () => {
    expect(relativeAcervoPath("T:/KnowChico/Cálculo", "KnowChico")).toBe("Cálculo");
  });

  it("é insensível a caixa", () => {
    expect(relativeAcervoPath("T:\\knowchico\\Ingles", "KnowChico")).toBe("Ingles");
  });

  it("não casa por substring — só o segmento inteiro", () => {
    expect(relativeAcervoPath("T:\\KnowChicoAntigo\\X", "KnowChico")).toBeNull();
  });

  it("marcador ausente devolve null", () => {
    expect(relativeAcervoPath("E:\\Livros", "KnowChico")).toBeNull();
  });

  it("marcador no fim, sem nada depois, devolve null", () => {
    expect(relativeAcervoPath("T:\\KnowChico", "KnowChico")).toBeNull();
  });
});

describe("scanLegacyAcervo", () => {
  let root = "";

  const library = (over: Partial<LegacyLibraryRow> = {}): LegacyLibraryRow => ({
    id: 1,
    name: "Cálculo",
    pathFolder: "T:\\KnowChico\\Cálculo",
    metadataFile: "metadata.knowchico",
    isSelected: false,
    ...over,
  });

  const fakeConfig = (rows: readonly LegacyLibraryRow[]): LegacyConfigReader => ({
    listLibraries: async () => rows,
  });

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "lbb-acervo-fixture-"));

    // Biblioteca registrada, com metadata presente.
    await mkdir(path.join(root, "Cálculo"), { recursive: true });
    await writeFile(path.join(root, "Cálculo", "metadata.knowchico"), "");

    // Biblioteca registrada, path composto (duas pastas de profundidade).
    await mkdir(path.join(root, "Provas", "ENEM"), { recursive: true });
    await writeFile(path.join(root, "Provas", "ENEM", "metadata.knowchico"), "");

    // Não registrada em lugar nenhum — o caso real do `ITA/`.
    await mkdir(path.join(root, "ITA", "Material"), { recursive: true });
    await writeFile(path.join(root, "ITA", "Material", "apostila.pdf"), "");

    // Cópia antiga, também não registrada — o caso real do `_Antigos/`.
    await mkdir(path.join(root, "_Antigos"), { recursive: true });
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("resolve o diretório local e confirma que o metadata existe", async () => {
    const report = await scanLegacyAcervo(fakeConfig([library()]), new NodeLegacyFsProbe(), {
      rootDir: root,
      rootMarker: "KnowChico",
    });

    expect(report.libraries).toEqual([
      {
        name: "Cálculo",
        relativePath: "Cálculo",
        localDir: path.posix.join(root, "Cálculo"),
        metadataPath: path.posix.join(root, "Cálculo", "metadata.knowchico"),
        metadataExists: true,
        isSelected: false,
      },
    ]);
  });

  it("resolve biblioteca com path de duas pastas", async () => {
    const report = await scanLegacyAcervo(
      fakeConfig([library({ id: 2, name: "Provas ENEM", pathFolder: "T:\\KnowChico\\Provas\\ENEM" })]),
      new NodeLegacyFsProbe(),
      { rootDir: root, rootMarker: "KnowChico" },
    );

    expect(report.libraries[0]?.relativePath).toBe("Provas/ENEM");
    expect(report.libraries[0]?.metadataExists).toBe(true);
  });

  it("acusa metadata ausente sem derrubar o scan", async () => {
    const report = await scanLegacyAcervo(
      fakeConfig([library({ name: "Fantasma", pathFolder: "T:\\KnowChico\\Fantasma" })]),
      new NodeLegacyFsProbe(),
      { rootDir: root, rootMarker: "KnowChico" },
    );

    expect(report.libraries[0]?.metadataExists).toBe(false);
  });

  it("path que não bate com a raiz vira `unresolved`, não é descartado em silêncio", async () => {
    const row = library({ pathFolder: "E:\\Livros" });
    const report = await scanLegacyAcervo(fakeConfig([row]), new NodeLegacyFsProbe(), {
      rootDir: root,
      rootMarker: "KnowChico",
    });

    expect(report.libraries).toEqual([]);
    expect(report.unresolved).toEqual([row]);
  });

  it("ITA e _Antigos aparecem como ignorados, com motivo — sem caso especial no código", async () => {
    const report = await scanLegacyAcervo(fakeConfig([library()]), new NodeLegacyFsProbe(), {
      rootDir: root,
      rootMarker: "KnowChico",
    });

    const names = report.ignored.map((entry) => entry.name).sort();
    expect(names).toEqual(["ITA", "Provas", "_Antigos"]);
    expect(report.ignored.every((entry) => entry.reason.includes("padrao.knowchicoconfig"))).toBe(
      true,
    );
  });

  it("pasta contabilizada por uma biblioteca não aparece como ignorada", async () => {
    const report = await scanLegacyAcervo(
      fakeConfig([library(), library({ id: 2, name: "Provas ENEM", pathFolder: "T:\\KnowChico\\Provas\\ENEM" })]),
      new NodeLegacyFsProbe(),
      { rootDir: root, rootMarker: "KnowChico" },
    );

    expect(report.ignored.map((entry) => entry.name)).not.toContain("Provas");
  });
});
