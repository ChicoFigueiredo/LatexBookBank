import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { BUILD_ID_FILE, rendererVersionFrom } from "../src/build-id.ts";

/**
 * A versão que o worker reporta carimba a **imagem**.
 *
 * Ela entra no hash de cache da aplicação. Dependia de alguém lembrar de mudar `RENDERER_VERSION`:
 * acrescentar `tkz-euclide` ao Dockerfile e reconstruir deixava o cache servindo a falha antiga
 * ("File `tkz-euclide.sty' not found") para sempre. O carimbo sai do build — pacotes instalados e
 * código do worker —, e muda sozinho quando a imagem muda.
 */

const stamp = (content: string): string => {
  const file = join(mkdtempSync(join(tmpdir(), "lbb-build-id-")), "build-id");
  writeFileSync(file, content);
  return file;
};

describe("rendererVersionFrom", () => {
  it("junta a versão declarada e o carimbo da imagem", () => {
    expect(rendererVersionFrom({ RENDERER_VERSION: "1.2.0" }, stamp("3f9a0c1b2d4e\n"))).toBe(
      "1.2.0+3f9a0c1b2d4e",
    );
  });

  it("sem versão declarada, o carimbo sozinho já distingue uma imagem da outra", () => {
    expect(rendererVersionFrom({}, stamp("aaaa"))).toBe("0.0.0-dev+aaaa");
    expect(rendererVersionFrom({}, stamp("bbbb"))).not.toBe(rendererVersionFrom({}, stamp("aaaa")));
  });

  it("fora da imagem (o worker rodando no host), sem carimbo, fica a versão declarada", () => {
    expect(rendererVersionFrom({ RENDERER_VERSION: "1.2.0" }, "/nao/existe/build-id")).toBe(
      "1.2.0",
    );
  });

  it("o Dockerfile grava o carimbo no arquivo que o worker lê", () => {
    const root = fileURLToPath(new URL("../../..", import.meta.url));
    const dockerfile = readFileSync(join(root, "services/renderer/Dockerfile"), "utf8");

    expect(dockerfile).toContain(`> ${BUILD_ID_FILE}`);
  });
});
