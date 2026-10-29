import { readFileSync } from "node:fs";

/**
 * O carimbo da imagem, gravado no build pelo `Dockerfile`.
 *
 * É um hash dos pacotes instalados (`dpkg-query`) e do código do worker e do contrato. Muda
 * quando a imagem muda — um pacote TeX a mais, um TeX Live novo, uma mudança em `compile.ts` — e
 * só então.
 */
export const BUILD_ID_FILE = "/etc/lbb-renderer-build-id";

/**
 * A versão que o worker reporta no `/health` e carimba em cada resultado.
 *
 * A aplicação usa esta versão no hash de cache. Antes ela era só `RENDERER_VERSION`, que alguém
 * precisava lembrar de mudar a cada `docker compose build`; esquecer servia do cache a falha ou o
 * PDF de outra imagem. Com o carimbo, a versão declarada continua valendo como rótulo, e o hash
 * da imagem garante que uma imagem diferente nunca reaproveita o cache da anterior.
 *
 * Sem carimbo — o worker rodando no host, nos testes —, fica a versão declarada.
 */
export function rendererVersionFrom(
  env: Readonly<Record<string, string | undefined>>,
  buildIdFile: string = BUILD_ID_FILE,
): string {
  const declared = env["RENDERER_VERSION"] ?? "0.0.0-dev";

  let buildId = "";
  try {
    buildId = readFileSync(buildIdFile, "utf8").trim();
  } catch {
    buildId = "";
  }

  return buildId === "" ? declared : `${declared}+${buildId}`;
}
