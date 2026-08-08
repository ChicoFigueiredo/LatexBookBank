import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { RenderProfile } from "@latexbookbank/render-contract";

/**
 * Preâmbulo pré-compilado (`mylatexformat`).
 *
 * O preâmbulo legado tem 34 packages, e **ele domina o custo da compilação**. Medido dentro desta
 * imagem, com o PDF conferido em cada execução:
 *
 * | | mediana |
 * |---|---|
 * | sem formato | **1886 ms** (1461–2815) |
 * | com formato | **508 ms** (458–601) |
 * | construir o formato | 2313 ms, uma vez |
 *
 * **3,7× mais rápido, ~1,38 s por compilação.** O formato se paga na segunda vez que alguém
 * compila com o mesmo perfil.
 *
 * ## Por que isto não é "estado no worker"
 *
 * O formato é **função pura do preâmbulo**: mesma entrada, mesmo arquivo. Ele mora em `/tmp`, que
 * é tmpfs, então some junto com o contêiner e é reconstruído na primeira compilação seguinte.
 * Duas réplicas com o mesmo perfil chegam ao mesmo formato — que é justamente a propriedade que
 * "sem catálogo no worker" existia para proteger.
 *
 * ## E se falhar
 *
 * Cai para a compilação normal. Uma otimização que quebra o produto quando não funciona não é
 * otimização — é uma segunda forma de falhar.
 */

const FORMATS_DIR = join(tmpdir(), "lbb-formats");

/** Fila por hash: dois jobs com o mesmo perfil não constroem o mesmo formato duas vezes. */
const building = new Map<string, Promise<string | null>>();

/**
 * A identidade do formato.
 *
 * Cobre classe, opções e preâmbulo — tudo que entra no `.fmt`. O corpo do documento **não** entra:
 * é justamente o que muda a cada compilação, e incluí-lo faria o formato ser reconstruído sempre,
 * transformando a otimização no seu contrário.
 */
export function formatKey(profile: RenderProfile): string {
  const canonical = [
    profile.documentClass,
    JSON.stringify(profile.documentClassOptions),
    JSON.stringify(profile.preamble),
  ].join("\n");

  return "lbb" + createHash("sha256").update(canonical).digest("hex").slice(0, 24);
}

/** O documento que gera o formato: classe, preâmbulo e o `\begin{document}` onde ele é gravado. */
export function formatSource(profile: RenderProfile): string {
  const options =
    profile.documentClassOptions.length > 0 ? `[${profile.documentClassOptions.join(",")}]` : "";

  return [
    `\\documentclass${options}{${profile.documentClass}}`,
    ...profile.preamble,
    // O `mylatexformat` grava o formato **ao chegar no `\begin{document}`**. Sem esta linha ele
    // lê o arquivo inteiro sem nunca gravar nada, e sai com sucesso aparente — foi assim que a
    // primeira tentativa produziu zero bytes e mediu cinco falhas como se fossem ganho.
    "\\begin{document}",
    "\\end{document}",
    "",
  ].join("\n");
}

/** O corpo, para compilar **com** formato: sem classe e sem preâmbulo, que já estão no `.fmt`. */
export const bodyWithFormat = (sourceLatex: string): string =>
  ["\\begin{document}", sourceLatex, "\\end{document}", ""].join("\n");

const exists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

/**
 * Garante o formato do perfil e devolve o nome dele, ou `null` se não deu.
 *
 * `null` não é erro: é "compile do jeito normal". Quem chama não precisa saber por quê.
 */
export async function ensureFormat(
  profile: RenderProfile,
  timeoutMs: number,
): Promise<string | null> {
  const key = formatKey(profile);

  if (await exists(join(FORMATS_DIR, `${key}.fmt`))) return key;

  const pending = building.get(key);
  if (pending !== undefined) return pending;

  const build = buildFormat(profile, key, timeoutMs).finally(() => building.delete(key));
  building.set(key, build);
  return build;
}

async function buildFormat(
  profile: RenderProfile,
  key: string,
  timeoutMs: number,
): Promise<string | null> {
  await mkdir(FORMATS_DIR, { recursive: true });
  const work = await mkdtemp(join(tmpdir(), "lbb-fmt-"));

  try {
    await writeFile(join(work, "src.tex"), formatSource(profile), "utf8");

    await new Promise<void>((resolve) => {
      execFile(
        "pdflatex",
        [
          "-ini",
          "-interaction=nonstopmode",
          "-no-shell-escape",
          `-jobname=${key}`,
          "-output-directory",
          FORMATS_DIR,
          // O `&pdflatex` carrega o formato base antes de o `mylatexformat` assumir; sem ele, o
          // `-ini` começa do TeX puro e nem `\documentclass` existe.
          "&pdflatex",
          "mylatexformat.ltx",
          join(work, "src.tex"),
        ],
        {
          cwd: work,
          timeout: timeoutMs,
          maxBuffer: 10 * 1024 * 1024,
          env: {
            PATH: process.env["PATH"] ?? "/usr/bin:/bin",
            HOME: work,
            TEXMFVAR: join(work, ".texmf-var"),
            SOURCE_DATE_EPOCH: "0",
          },
        },
        () => resolve(),
      );
    });

    // Só o arquivo conta. O `pdflatex -ini` sai com sucesso mesmo sem gravar formato nenhum, e
    // confiar no código de saída aqui foi exatamente o erro que produziu uma medição inválida.
    return (await exists(join(FORMATS_DIR, `${key}.fmt`))) ? key : null;
  } catch {
    return null;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

export { FORMATS_DIR };
