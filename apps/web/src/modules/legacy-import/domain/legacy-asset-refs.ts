/**
 * Quais arquivos o LaTeX legado **promete** que existem no disco.
 *
 * O acervo guarda a figura fora do banco: o `.knowchico` tem só o texto, e o arquivo mora em
 * `pub<10 dígitos>/idQuestion<IdQuestao>/images/…`, ao lado do `preview.png`. Uma referência que
 * não acha o arquivo não quebra nada na hora do import — o texto entra igual, com a citação
 * pendurada — e só aparece meses depois, quando alguém manda compilar a questão e o pdflatex
 * responde "File not found" sobre um arquivo que ficou no HD antigo. Por isso o relatório existe:
 * o momento de descobrir isso é enquanto o acervo de origem ainda está montado.
 *
 * O levantamento contra o acervo real (2026-09-02) mostrou **um formato só** em uso — sempre
 * `\includegraphics[width=…\linewidth]{images/clipboard_<data>.png}`, gerado pelo colar-do-
 * clipboard do app legado. Nenhum `\input`, nenhum `\includepdf`, nenhum caminho absoluto.
 *
 * Ver checklist Fase 11, bloco "Relatório: assets ausentes" · issue #111.
 */

/**
 * Só os dois comandos que citam **arquivo de conteúdo**.
 *
 * `\input`/`\include` ficam de fora de propósito: eles carregam preâmbulo e pacote
 * (`\input{amsmath}`), que não é asset e não mora na pasta da questão. Incluí-los encheria o
 * relatório de ausências que ninguém pode resolver — e um relatório com ruído é um relatório que
 * ninguém lê.
 */
const ASSET_COMMANDS = ["includegraphics", "includepdf"] as const;

const REF_PATTERN = new RegExp(
  String.raw`\\(${ASSET_COMMANDS.join("|")})\*?\s*(?:\[[^\]]*\])?\s*\{([^{}]*)\}`,
  "g",
);

export interface LegacyLatexField {
  /** Nome da coluna legada (`latexQuestao`, `latexResposta`, …) — vai no relatório para saber onde olhar. */
  readonly field: string;
  readonly latex: string | null | undefined;
}

export interface LegacyAssetRef {
  readonly field: string;
  readonly command: (typeof ASSET_COMMANDS)[number];
  /** Como o LaTeX escreveu, sem tocar — é o texto que a pessoa vai procurar no editor. */
  readonly raw: string;
  /** O mesmo caminho em POSIX, sem `./`, para casar com o filesystem. */
  readonly relativePath: string;
  /**
   * Absoluto, com letra de unidade, ou subindo com `..`: sai da pasta da questão e não dá para
   * dizer que "falta" — o arquivo pode existir num lugar que o import nunca vai copiar.
   */
  readonly escapesQuestionDir: boolean;
}

/**
 * Tira comentário LaTeX antes de procurar referência.
 *
 * Uma figura comentada não compila, logo não falta arquivo nenhum — reportá-la seria mandar
 * alguém caçar um `.png` que o autor já tinha decidido não usar. E `\%` é porcentagem escrita,
 * não começo de comentário: por isso a varredura anda caractere a caractere em vez de cortar no
 * primeiro `%` da linha.
 */
function stripLatexComments(latex: string): string {
  let out = "";

  for (let i = 0; i < latex.length; i += 1) {
    const char = latex[i] as string;

    if (char === "\\") {
      out += char + (latex[i + 1] ?? "");
      i += 1;
      continue;
    }

    if (char === "%") {
      const lineEnd = latex.indexOf("\n", i);
      if (lineEnd === -1) break;
      i = lineEnd - 1;
      continue;
    }

    out += char;
  }

  return out;
}

const toPosix = (raw: string): string =>
  raw
    .trim()
    .replace(/\\/g, "/")
    .replace(/^(?:\.\/)+/, "");

const escapesQuestionDir = (posixPath: string): boolean =>
  posixPath.startsWith("/") ||
  /^[A-Za-z]:/.test(posixPath) ||
  posixPath.split("/").includes("..");

/** Todas as referências dos campos dados, na ordem em que aparecem. Sem deduplicar — quem monta o relatório decide isso. */
export function extractLegacyAssetRefs(
  fields: readonly LegacyLatexField[],
): readonly LegacyAssetRef[] {
  const refs: LegacyAssetRef[] = [];

  for (const { field, latex } of fields) {
    if (typeof latex !== "string" || latex === "") continue;

    for (const match of stripLatexComments(latex).matchAll(REF_PATTERN)) {
      const raw = (match[2] ?? "").trim();
      if (raw === "") continue;

      const relativePath = toPosix(raw);
      if (relativePath === "") continue;

      refs.push({
        field,
        command: match[1] as (typeof ASSET_COMMANDS)[number],
        raw,
        relativePath,
        escapesQuestionDir: escapesQuestionDir(relativePath),
      });
    }
  }

  return refs;
}

/**
 * A pasta onde o legado guarda os arquivos de uma questão, relativa à pasta da biblioteca.
 *
 * O zero à esquerda não é estético: o app legado grava `pub0000000008`, e `pub8` simplesmente não
 * existe no disco. Já o `idQuestion` vai cru — `idQuestion9`, `idQuestion198`. Conferido nas oito
 * publicações reais que têm arquivo por questão.
 */
export const legacyQuestionAssetDir = (idPublication: number, idQuestao: number): string =>
  `pub${String(idPublication).padStart(10, "0")}/idQuestion${idQuestao}`;
