import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  isSafeAssetName,
  requestsShellEscape,
  validateRenderBundle,
  type RenderArtifactDescriptor,
  type RenderBundle,
  type RenderResult,
} from "@latexbookbank/render-contract";

import { hasErrors, parseLatexLog, toBodyRelative } from "./diagnostics.ts";
import { bodyWithFormat, ensureFormat, FORMATS_DIR } from "./format-cache.ts";

/**
 * A compilação.
 *
 * Três regras não negociáveis, e cada uma existe porque a alternativa é uma vulnerabilidade
 * conhecida, não uma hipótese:
 *
 * **`execFile` com vetor de argumentos, nunca string de shell.** Não há shell no caminho, então
 * não há o que escapar: um nome de arquivo com `;` ou `$()` é só um nome de arquivo. Montar a
 * linha de comando por concatenação é como isto se torna execução remota de código, e o acervo
 * legado tem nomes de arquivo com espaço, acento e parêntese.
 *
 * **`-no-shell-escape` explícito.** O `pdflatex` do TeX Live já vem com escape restrito por
 * padrão, mas "por padrão" depende do `texmf.cnf` da distribuição, e a imagem pode mudar de base
 * um dia. Passar a flag torna a garantia local ao código, e local é onde ela pode ser verificada.
 *
 * **Diretório temporário por job, apagado no `finally`.** É o que faz `\include` e
 * `\includegraphics` só enxergarem o que veio no bundle, e é o que impede um job de ler o que
 * outro deixou para trás.
 */

const PDFLATEX = "pdflatex";
const PDFTOCAIRO = "pdftocairo";

export interface CompileOutcome {
  readonly result: RenderResult;
  /** Bytes dos artefatos, por nome. Quem persiste é a aplicação (D35). */
  readonly artifacts: ReadonlyMap<string, Buffer>;
}

interface ProcessOutcome {
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
}

/**
 * Roda um programa e devolve a saída, sem lançar por código de saída.
 *
 * O `pdflatex` sai com código diferente de zero em erro de compilação, que é um resultado normal
 * do nosso ponto de vista — quem escreveu LaTeX quebrado precisa ver o diagnóstico, não uma
 * exceção. Falha de verdade é o binário não existir, e essa continua lançando.
 */
function run(
  file: string,
  args: readonly string[],
  cwd: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<ProcessOutcome> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      [...args],
      {
        cwd,
        timeout: timeoutMs,
        // Cancelar mata o processo. Sem isto, o `pdflatex` de um job recusado seguiria até o fim
        // ocupando o worker — e num worker de concorrência baixa isso atrasa quem está esperando.
        ...(signal === undefined ? {} : { signal }),
        // 10 MB: o log do LaTeX com `pgfplots` passa fácil de 1 MB, e estourar o buffer mataria a
        // compilação com um erro que não tem nada a ver com o documento.
        maxBuffer: 10 * 1024 * 1024,
        // O ambiente é podado: o worker não repassa o que recebeu. `TEXMFVAR` aponta para o
        // diretório do job porque o TeX escreve cache de fonte, e escrever no HOME faria dois
        // jobs disputarem o mesmo arquivo.
        env: {
          PATH: process.env["PATH"] ?? "/usr/bin:/bin",
          HOME: cwd,
          TEXMFVAR: join(cwd, ".texmf-var"),
          SOURCE_DATE_EPOCH: "0",
          // O `:` final devolve o caminho padrão do kpathsea. Sem ele, o `pdflatex` deixaria de
          // achar o próprio `pdflatex.fmt` e **toda** compilação falharia, inclusive as que não
          // usam formato pré-compilado.
          TEXFORMATS: `${FORMATS_DIR}:`,
        },
      },
      (error, stdout, stderr) => {
        const timedOut =
          error !== null && "killed" in error && (error as { killed?: boolean }).killed === true;

        if (error !== null && !timedOut && "code" in error && typeof error.code === "string") {
          // `ENOENT`: o binário não está na imagem. Isso é defeito de infraestrutura, não do
          // documento, e precisa subir como exceção para aparecer no `/health`.
          reject(error);
          return;
        }

        resolve({ stdout: String(stdout), stderr: String(stderr), timedOut });
      },
    );
  });
}

const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

/**
 * Monta o documento a partir do perfil resolvido.
 *
 * O `sourceLatex` do bundle é o corpo; a classe e o preâmbulo vêm do perfil. Separar os dois é o
 * que permite trocar o perfil sem reescrever a questão — e é o que faz o hash de cache mudar
 * quando o preâmbulo muda, que é exatamente quando o PDF muda.
 */
export function buildDocument(bundle: RenderBundle): string {
  const { profile } = bundle;
  const options =
    profile.documentClassOptions.length > 0 ? `[${profile.documentClassOptions.join(",")}]` : "";

  return [
    `\\documentclass${options}{${profile.documentClass}}`,
    ...profile.preamble,
    "\\begin{document}",
    bundle.sourceLatex,
    "\\end{document}",
    "",
  ].join("\n");
}

export interface CompileDeps {
  readonly rendererVersion: string;
  /** Injetável para o teste medir sem depender do relógio. */
  readonly now?: () => number;
  /** Interrompe a compilação. Vem do `JobStore`, que é quem sabe que o job foi cancelado. */
  readonly signal?: AbortSignal;
}

export async function compile(
  bundle: RenderBundle,
  assetBytes: ReadonlyMap<string, Buffer>,
  deps: CompileDeps,
): Promise<CompileOutcome> {
  const now = deps.now ?? (() => Date.now());
  const startedAt = now();

  validateRenderBundle(bundle);

  if (requestsShellEscape(bundle.sourceLatex)) {
    // Recusado antes de tocar o disco. A defesa real é `-no-shell-escape`; esta camada existe
    // porque a outra é uma flag, e flags somem em refatoração sem deixar rastro.
    return {
      result: failure(bundle, deps.rendererVersion, now() - startedAt, [
        {
          severity: "error",
          message: "O documento pede execução de shell (`\\write18`), que não é permitida.",
          line: null,
          file: null,
        },
      ]),
      artifacts: new Map(),
    };
  }

  const dir = await mkdtemp(join(tmpdir(), "lbb-render-"));

  try {
    for (const asset of bundle.assets) {
      const bytes = assetBytes.get(asset.name);
      if (bytes === undefined) {
        throw new Error(`Asset \`${asset.name}\` está no manifesto mas não veio nos bytes.`);
      }
      if (sha256(bytes) !== asset.sha256) {
        // Manifesto que não bate com o conteúdo é erro, não aviso: ou o transporte corrompeu, ou
        // alguém trocou o arquivo no caminho, e as duas hipóteses pedem parar.
        throw new Error(`Asset \`${asset.name}\`: sha256 não confere com os bytes recebidos.`);
      }
      // `isSafeAssetName` já rodou na validação; a segunda checagem custa nada e é a que sobra se
      // alguém um dia mexer na ordem das chamadas.
      if (!isSafeAssetName(asset.name)) throw new Error(`Asset \`${asset.name}\` recusado.`);

      await writeFile(join(dir, asset.name), bytes);
    }

    // O preâmbulo domina o custo: medido nesta imagem, 1886 ms sem formato contra 508 ms com ele.
    // `null` significa "não deu" — e aí compila do jeito normal, porque uma otimização que
    // quebra o produto quando falha não é otimização.
    const format = await ensureFormat(bundle.profile, bundle.options.timeoutMs);

    await writeFile(
      join(dir, "main.tex"),
      format === null ? buildDocument(bundle) : bodyWithFormat(bundle.sourceLatex),
      "utf8",
    );

    /**
     * Quantas linhas existem **antes** do corpo no arquivo que acabou de ser escrito.
     *
     * Sai daqui, e não de uma constante, porque o número depende do caminho que a compilação
     * tomou: com formato é só o `\begin{document}`; sem ele, a classe mais o preâmbulo inteiro.
     * Calcular isto longe da escrita seria a mesma decisão em dois lugares.
     */
    const bodyOffset = format === null ? 1 + bundle.profile.preamble.length + 1 : 1;

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    for (let pass = 0; pass < bundle.options.passes; pass += 1) {
      const outcome = await run(
        PDFLATEX,
        [
          // Sem parada interativa: sem isto, um erro faz o `pdflatex` esperar entrada para sempre
          // e o job só termina no timeout.
          "-interaction=nonstopmode",
          "-halt-on-error",
          "-no-shell-escape",
          "-file-line-error",
          ...(format === null ? [] : [`-fmt=${format}`]),
          "-output-directory",
          dir,
          "main.tex",
        ],
        dir,
        bundle.options.timeoutMs,
        deps.signal,
      );

      stdout += outcome.stdout;
      stderr += outcome.stderr;
      timedOut = outcome.timedOut;
      if (timedOut) break;
    }

    const diagnostics = timedOut
      ? [
          {
            severity: "error" as const,
            message: `A compilação passou de ${bundle.options.timeoutMs} ms e foi interrompida.`,
            line: null,
            file: null,
          },
        ]
      : // O log conta a partir do `\documentclass`; o `RenderDiagnostic.line` promete a linha do
        // `sourceLatex`. É aqui que a promessa passa a ser verdade.
        toBodyRelative(parseLatexLog(stdout), bodyOffset);

    const pdfBytes = await readFileOrNull(join(dir, "main.pdf"));

    if (pdfBytes === null) {
      return {
        result: failure(
          bundle,
          deps.rendererVersion,
          now() - startedAt,
          diagnostics.length > 0
            ? diagnostics
            : [
                {
                  severity: "error",
                  message: "O `pdflatex` terminou sem produzir PDF e sem erro reconhecível.",
                  line: null,
                  file: null,
                },
              ],
          stdout,
          stderr,
        ),
        artifacts: new Map(),
      };
    }

    const artifacts = new Map<string, Buffer>([["main.pdf", pdfBytes]]);
    const pngDescriptors = await renderPngs(
      dir,
      bundle.options.dpi,
      bundle.options.timeoutMs,
      artifacts,
      deps.signal,
    );

    return {
      result: {
        jobId: bundle.jobId,
        // PDF existe: sucesso. Aviso não é falha — o LaTeX produz dezenas deles em documento são.
        success: true,
        pdf: {
          name: "main.pdf",
          mimeType: "application/pdf",
          sizeBytes: pdfBytes.byteLength,
          sha256: sha256(pdfBytes),
          width: null,
          height: null,
        },
        png: pngDescriptors,
        diagnostics,
        stdout,
        stderr,
        durationMs: now() - startedAt,
        rendererVersion: deps.rendererVersion,
      },
      artifacts,
    };
  } finally {
    // `force` porque o diretório pode já ter sumido se o processo foi morto; falhar aqui esconderia
    // o resultado real da compilação atrás de um erro de limpeza.
    await rm(dir, { recursive: true, force: true });
  }
}

async function readFileOrNull(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch {
    return null;
  }
}

/**
 * PDF → PNG, uma imagem por página.
 *
 * O `pdftocairo` nomeia as saídas como `page-1.png`, `page-2.png`… e é ele quem decide quantas
 * são. Ler o diretório depois, em vez de supor uma página, é o que faz uma lista de exercícios
 * com três páginas chegar inteira ao preview.
 */
async function renderPngs(
  dir: string,
  dpi: number,
  timeoutMs: number,
  artifacts: Map<string, Buffer>,
  signal?: AbortSignal,
): Promise<readonly RenderArtifactDescriptor[]> {
  await run(
    PDFTOCAIRO,
    ["-png", "-r", String(dpi), join(dir, "main.pdf"), join(dir, "page")],
    dir,
    timeoutMs,
    signal,
  );

  const names = (await readdir(dir))
    .filter((name) => name.startsWith("page") && name.endsWith(".png"))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));

  const descriptors: RenderArtifactDescriptor[] = [];
  for (const name of names) {
    const bytes = await readFile(join(dir, name));
    artifacts.set(name, bytes);
    descriptors.push({
      name,
      mimeType: "image/png",
      sizeBytes: bytes.byteLength,
      sha256: sha256(bytes),
      ...readPngSize(bytes),
    });
  }
  return descriptors;
}

/**
 * Largura e altura do PNG, lidas do cabeçalho.
 *
 * O `IHDR` é sempre o primeiro chunk e está sempre nos mesmos oito bytes. Ler daqui evita trazer
 * uma biblioteca de imagem para dentro do worker só para descobrir dois números — e cada
 * dependência a menos no worker é uma a menos para auditar.
 */
function readPngSize(bytes: Buffer): { width: number | null; height: number | null } {
  if (bytes.length < 24 || bytes.readUInt32BE(12) !== 0x49484452) {
    return { width: null, height: null };
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function failure(
  bundle: RenderBundle,
  rendererVersion: string,
  durationMs: number,
  diagnostics: readonly RenderResult["diagnostics"][number][],
  stdout = "",
  stderr = "",
): RenderResult {
  return {
    jobId: bundle.jobId,
    success: false,
    pdf: null,
    png: [],
    diagnostics,
    stdout,
    stderr,
    durationMs,
    rendererVersion,
  };
}

export { hasErrors };
