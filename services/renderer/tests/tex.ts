import { spawnSync } from "node:child_process";
import { describe } from "vitest";

/**
 * Os testes que compilam de verdade precisam de `pdflatex` e `pdftocairo` no PATH.
 *
 * Na máquina de desenvolvimento e no job `renderer-tex` do CI eles estão; no job `verify` não, e
 * por quase dois meses isso deixou o CI vermelho em todo run (TST-04 da revisão de 2026-09-23):
 * `spawn pdflatex ENOENT` escondia qualquer falha real, e o passo de build nunca rodava.
 *
 * Sem os binários, os blocos marcados aqui são **pulados de forma visível**: o nome do bloco diz
 * por quê, e o arquivo avisa no stderr. Pular calado seria o defeito oposto — o teste de
 * segurança do `\openin` sumiria do resumo e ninguém notaria.
 *
 * Onde o TeX é obrigatório (o job `renderer-tex`), `RENDERER_REQUIRE_TEX=1` transforma a
 * ausência em erro. Sem isso, um job que instalasse o pacote errado passaria verde sem compilar
 * nada.
 */

const TEX_BINARIES = [
  ["pdflatex", "--version"],
  ["pdftocairo", "-v"],
] as const;

const missing = TEX_BINARIES.filter(([bin, flag]) => {
  const probe = spawnSync(bin, [flag], { stdio: "ignore" });
  return probe.error !== undefined || probe.status !== 0;
}).map(([bin]) => bin);

export const TEX_AVAILABLE = missing.length === 0;

const SKIP_REASON = `sem ${missing.join(" e ")} no PATH`;

if (!TEX_AVAILABLE) {
  if (process.env["RENDERER_REQUIRE_TEX"] === "1") {
    throw new Error(
      `RENDERER_REQUIRE_TEX=1, mas o ambiente está ${SKIP_REASON}: os testes de compilação não rodariam.`,
    );
  }
  console.warn(`[renderer] testes de compilação pulados: ${SKIP_REASON}.`);
}

/** `describe` que só roda com o TeX instalado, e que diz no nome por que pulou quando não está. */
export function describeWithTex(name: string, body: () => void): void {
  describe.runIf(TEX_AVAILABLE)(TEX_AVAILABLE ? name : `${name} — pulado: ${SKIP_REASON}`, body);
}
