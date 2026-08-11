import "server-only";

import { execFile } from "node:child_process";
import { promisify } from "node:util";

/**
 * O TeX do **host** — informativo, e marcado como fallback opcional.
 *
 * O caminho de render do produto é o worker em Docker (D27). O TeX da máquina não é usado por
 * nada hoje, e é justamente por isso que ele precisa aparecer **dito assim**: quem vê "pdflatex
 * 2023" numa página de diagnóstico conclui que é ele que compila, e vai depurar a versão errada
 * quando um PDF sair diferente do esperado. A imagem traz TeX Live 2022, e a máquina de
 * desenvolvimento tem 2023 — a divergência está registrada como impedimento na Fase 6.
 *
 * `execFile` com vetor de argumentos, nunca string de shell (§42). Aqui não há entrada de usuário
 * nenhuma, mas a regra vale pelo hábito: é o mesmo cuidado que impede o próximo caso, que terá.
 *
 * Ver spec §25 · issue #168.
 */

const run = promisify(execFile);

/** Um segundo e meio: a página não pode ficar presa sondando um binário que trava. */
const PROBE_TIMEOUT_MS = 1_500;

async function version(command: string, args: readonly string[]): Promise<string | null> {
  try {
    const { stdout, stderr } = await run(command, [...args], { timeout: PROBE_TIMEOUT_MS });
    // stdout **e** stderr: `pdftocairo -v` sai com código 0 e escreve em stderr. Uma sonda que só
    // olhasse stdout diria "ausente" sobre algo instalado — e mandaria instalar o que já existe.
    const output = (stdout.trim() || stderr.trim()).split("\n")[0]?.trim();
    return output === undefined || output === "" ? null : output;
  } catch {
    return null;
  }
}

export interface HostTex {
  readonly pdflatex: string | null;
  readonly pdftocairo: string | null;
}

export const probeHostTex = async (): Promise<HostTex> => {
  const [pdflatex, pdftocairo] = await Promise.all([
    version("pdflatex", ["--version"]),
    version("pdftocairo", ["-v"]),
  ]);

  return { pdflatex, pdftocairo };
};
