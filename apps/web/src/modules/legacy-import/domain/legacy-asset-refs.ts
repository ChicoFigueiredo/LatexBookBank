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

import type { LegacyFsProbe } from "./legacy-config";
import type { LegacyLibraryContents } from "./legacy-library-reader";

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

/* ───────────────────────── referências agrupadas por questão ───────────────────────── */

export interface LegacyQuestionRefs {
  readonly legacyQuestionId: number;
  readonly idPublication: number | null;
  /** Deduplicadas por caminho e ordenadas — a mesma figura citada duas vezes é um arquivo só. */
  readonly refs: readonly LegacyAssetRef[];
}

/**
 * Todas as referências de uma biblioteca, agrupadas pela questão **dona** da pasta.
 *
 * Por questão porque a pasta no disco é por questão: a figura de uma alternativa mora em
 * `idQuestion<IdQuestao da questão dona>`, nunca numa pasta da alternativa — conferido no acervo
 * (Fundamentos, alternativas 6 e 7 da questão 10, em `pub0000000001/idQuestion10/images/`).
 *
 * É o mesmo agrupamento que o relatório de ausentes e o import de figuras usam: se um dia os
 * dois divergissem, o relatório diria "está tudo no disco" sobre um arquivo que o import não
 * levaria.
 */
export function legacyAssetRefsByQuestion(
  contents: Pick<LegacyLibraryContents, "questions" | "options">,
): readonly LegacyQuestionRefs[] {
  const publicationOf = new Map(contents.questions.map((row) => [row.IdQuestao, row.idPublication]));
  const grouped = new Map<number, LegacyAssetRef[]>();

  const push = (legacyQuestionId: number, refs: readonly LegacyAssetRef[]): void => {
    if (refs.length === 0) return;
    const bucket = grouped.get(legacyQuestionId) ?? [];
    bucket.push(...refs);
    grouped.set(legacyQuestionId, bucket);
  };

  for (const row of contents.questions) {
    push(
      row.IdQuestao,
      extractLegacyAssetRefs([
        { field: "latexQuestao", latex: row.latexQuestao },
        { field: "latexResposta", latex: row.latexResposta },
        { field: "latexComplemento", latex: row.latexComplemento },
        // `latexOrigin` é o texto de origem, mantido como veio; se ele cita figura, o arquivo
        // precisa existir tanto quanto o do enunciado.
        { field: "latexOrigin", latex: row.latexOrigin },
      ]),
    );
  }

  for (const row of contents.options) {
    push(
      row.IdQuestao,
      extractLegacyAssetRefs([
        { field: `Questao_Itens.${row.IdQuestao_Itens}.latexItem`, latex: row.latexItem },
        { field: `Questao_Itens.${row.IdQuestao_Itens}.latexResposta`, latex: row.latexResposta },
        { field: `Questao_Itens.${row.IdQuestao_Itens}.latexOrigin`, latex: row.latexOrigin },
      ]),
    );
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => a - b)
    .map(([legacyQuestionId, refs]) => ({
      legacyQuestionId,
      idPublication: publicationOf.get(legacyQuestionId) ?? null,
      // Fica a primeira citação, que é a que a pessoa vai achar primeiro abrindo a questão.
      refs: dedupeByPath(refs).sort((a, b) => a.relativePath.localeCompare(b.relativePath)),
    }));
}

function dedupeByPath(refs: readonly LegacyAssetRef[]): LegacyAssetRef[] {
  const first = new Map<string, LegacyAssetRef>();
  for (const ref of refs) {
    if (!first.has(ref.relativePath)) first.set(ref.relativePath, ref);
  }
  return [...first.values()];
}

/* ───────────────────────────── localizar no disco ───────────────────────────── */

/**
 * Sem extensão, o `graphicx` tenta uma lista dele — então a busca também tenta, senão acusaria
 * falta de um arquivo que o pdflatex acharia sozinho. Ordem do `\DeclareGraphicsExtensions`
 * padrão do pdftex, com `.jpeg` a mais porque o acervo tem imagem colada de clipboard.
 */
const GRAPHICS_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".eps"] as const;

const hasExtension = (relativePath: string): boolean =>
  /\.[A-Za-z0-9]{1,5}$/.test(relativePath.split("/").pop() ?? relativePath);

const joinPosix = (...parts: readonly string[]): string =>
  parts.filter((part) => part !== "").join("/");

/**
 * O caminho (POSIX) do arquivo que a referência cita, ou `null` quando não há arquivo.
 *
 * `questionDir` é a pasta da questão dona já resolvida contra a biblioteca — quem chama sabe onde
 * a biblioteca está; esta função só sabe onde, dentro dela, a questão guarda as coisas.
 */
export async function locateLegacyAsset(
  fs: Pick<LegacyFsProbe, "exists">,
  questionDir: string,
  relativePath: string,
): Promise<string | null> {
  const target = joinPosix(questionDir, relativePath);
  if (await fs.exists(target)) return target;
  if (hasExtension(relativePath)) return null;

  for (const extension of GRAPHICS_EXTENSIONS) {
    const candidate = `${target}${extension}`;
    if (await fs.exists(candidate)) return candidate;
  }
  return null;
}

/* ───────────────────────────── reescrever a citação ───────────────────────────── */

/**
 * Troca, dentro de cada `\includegraphics{…}`, o caminho legado pelo nome novo.
 *
 * O renderizador do produto novo não tem pasta `images/`: cada asset viaja no bundle com um nome
 * simples — sem barra, por contrato — e é esse nome que o LaTeX precisa citar. Reescrever é o
 * **único** caminho: um alias `images/clipboard_x.png` seria recusado pelo próprio contrato do
 * bundle, e uma `\graphicspath` não resolve um caminho que já tem diretório dentro.
 *
 * Só o argumento muda. As opções (`[width=…]`), o `\r` do editor legado e o resto do texto ficam
 * exatamente como estavam — este é o enunciado de alguém, e a reescrita precisa ser reconhecível
 * num diff. Caminho que não está no mapa fica intocado.
 */
export function rewriteLegacyAssetRefs(
  latex: string,
  renames: ReadonlyMap<string, string>,
): string {
  if (renames.size === 0) return latex;

  return latex.replace(REF_PATTERN, (whole: string, _command: string, argument: string) => {
    const relativePath = toPosix(argument);
    const name = renames.get(relativePath);
    if (name === undefined) return whole;
    return whole.replace(/\{[^{}]*\}$/, `{${name}}`);
  });
}
