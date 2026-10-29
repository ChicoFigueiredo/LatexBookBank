import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Uma raiz de composição, e o ambiente lido uma vez (STE-08, ARQ-03, STM-14, STE-12).
 *
 * O storage era instanciado em doze lugares e a IA em quatro; `AI_VISION_MODEL` era lido cru em
 * quatro, sem `trim`. Trocar o storage por um bucket, ou a regra de "visão configurada", exigia
 * achar todos — e o esquecido gravava num lugar e lia de outro. Este guarda varre o código para
 * que o próximo `new` concreto, ou a próxima leitura solta do ambiente, não volte calado.
 */

const root = fileURLToPath(new URL("..", import.meta.url));

function sources(dir: string): string[] {
  return readdirSync(path.join(root, dir), { recursive: true, encoding: "utf8" })
    .filter((file) => /\.(ts|tsx)$/.test(file) && !file.includes("generated"))
    .map((file) => path.join(dir, file));
}

const codigo = [...sources("src"), ...sources("app")].map((file) => ({
  file,
  text: readFileSync(path.join(root, file), "utf8"),
}));

/** Cada adaptador concreto, e o único arquivo que pode instanciá-lo. */
const DONOS: ReadonlyArray<readonly [string, string]> = [
  ["LocalFileStorageProvider", "src/infrastructure/composition.ts"],
  ["OpenAiCompatibleProvider", "src/infrastructure/composition.ts"],
  ["VisionMathRecognizer", "src/infrastructure/composition.ts"],
  // O render guarda o executor do processo (a versão lida do `/health`), e por isso tem a sua.
  ["RenderWorkerExecutor", "src/modules/rendering/infrastructure/render-wiring.ts"],
];

describe("os adaptadores concretos nascem na raiz de composição", () => {
  it("há código para varrer", () => {
    expect(codigo.length).toBeGreaterThan(100);
  });

  for (const [classe, dono] of DONOS) {
    it(`\`new ${classe}\` só em ${dono}`, () => {
      const fora = codigo
        .filter(({ file, text }) => text.includes(`new ${classe}(`) && file !== dono)
        .map(({ file }) => file);

      expect(fora).toEqual([]);
    });
  }

  it("as fábricas devolvem a porta, e não a classe concreta", () => {
    // `aiProvider()` devolvia `OpenAiCompatibleProvider`: quem chamava podia usar o que a porta
    // não promete, e trocar o adaptador quebraria o chamador em vez de ser só trocar a fábrica.
    const composition = readFileSync(path.join(root, "src/infrastructure/composition.ts"), "utf8");
    const returnTypes = [...composition.matchAll(/\)\s*:\s*([^=;{]*?)\s*\{\n/g)].map(
      (match) => match[1] ?? "",
    );

    expect(returnTypes.length).toBeGreaterThan(0);
    expect(
      returnTypes.filter((type) => DONOS.some(([concrete]) => type.includes(concrete))),
    ).toEqual([]);
  });
});

/**
 * Quem pode ler `process.env` direto, e por quê. Fora daqui, a configuração vem de `env()`.
 */
const LEITORES = new Set([
  // O ponto de leitura, validado uma vez.
  "src/shared/config/env.ts",
  // O cliente Prisma nasce no import; os testes trocam o `DATABASE_URL` antes de importá-lo, e o
  // `env()` guardado no processo apontaria para o banco anterior.
  "src/infrastructure/database/sqlite/client.ts",
  // O logger é de tudo, inclusive de script sem `DATABASE_URL`; `env()` recusaria subir ali.
  "src/shared/observability/logger.ts",
]);

describe("o ambiente é lido uma vez", () => {
  it("ninguém mais lê `process.env`, a não ser o `NODE_ENV` do próprio Next", () => {
    const soltos = codigo
      .filter(({ file }) => !LEITORES.has(file))
      .filter(({ text }) =>
        text.replaceAll(/process\.env(\.NODE_ENV|\["NODE_ENV"\])/g, "").match(/process\.env\b/),
      )
      .map(({ file }) => file);

    expect(soltos).toEqual([]);
  });
});
