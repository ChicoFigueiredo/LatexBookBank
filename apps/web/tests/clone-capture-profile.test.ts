import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { cloneProfileSource, exportNameOf, registerProfileSource } from "../scripts/clone-capture-profile";

/**
 * Derivar um perfil novo do `book-fme-v1`, o perfil de referência (D78): o arquivo de verdade,
 * e não um modelo dele — se o perfil de referência mudar de forma, o clone tem de reclamar.
 */

const profiles = path.join(__dirname, "../src/modules/scan/domain/profiles");
const reference = readFileSync(path.join(profiles, "book-fme-v1.ts"), "utf8");

describe("clonar o perfil de referência", () => {
  const clone = cloneProfileSource(reference, { id: "book-xyz-v1", label: "Coleção XYZ", today: "2026-11-11" });

  it("troca o id, o export, o rótulo e começa na versão 1", () => {
    expect(exportNameOf("book-xyz-v1")).toBe("bookXyzV1");
    expect(clone).toContain('export const bookXyzV1: CaptureProfile = {');
    expect(clone).toContain('id: "book-xyz-v1",');
    expect(clone).toContain('label: "Coleção XYZ",');
    expect(clone).toMatch(/^ {2}version: 1,$/m);
    expect(clone).not.toContain('id: "book-fme-v1",');
  });

  it("diz de onde veio, e o resto do arquivo vem inteiro", () => {
    expect(clone.startsWith("/*\n  Derivado de `book-fme-v1` em 2026-11-11")).toBe(true);
    expect(clone).toContain("answerStart(line)");
    expect(clone).toContain("zones(pages: readonly PageModel[])");
  });

  it("registra o perfil novo ao lado dos outros", () => {
    const index = readFileSync(path.join(profiles, "index.ts"), "utf8");
    const registered = registerProfileSource(index, "book-xyz-v1");
    expect(registered).toContain('import { bookXyzV1 } from "./book-xyz-v1";');
    expect(registered).toContain("registerCaptureProfile(bookXyzV1);");
    // O que estava lá continua.
    expect(registered).toContain("registerCaptureProfile(bookFmeV1);");
  });
});
