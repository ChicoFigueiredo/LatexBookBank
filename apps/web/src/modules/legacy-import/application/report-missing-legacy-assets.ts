import path from "node:path";

import {
  extractLegacyAssetRefs,
  legacyQuestionAssetDir,
  type LegacyAssetRef,
} from "../domain/legacy-asset-refs";
import type { LegacyFsProbe } from "../domain/legacy-config";
import type { LegacyLibraryContents } from "../domain/legacy-library-reader";

/**
 * O que o LaTeX importável cita e o disco não tem.
 *
 * Roda **antes** do import, com o acervo de origem ainda montado: depois de gravar, a mesma
 * pergunta continua respondível, mas a resposta já não serve para nada — o HD com os arquivos
 * pode não estar mais aí. Por isso é relatório e não erro: uma figura perdida não justifica
 * recusar uma biblioteca de 230 questões, justifica avisar quais são as três que vão compilar
 * torto (mesma decisão do Chico que rege `excluded` em `map-legacy-library.ts`).
 *
 * Ver checklist Fase 11, bloco "Relatório: assets ausentes" · issue #111.
 */

/**
 * Sem extensão, o `graphicx` tenta uma lista dele — então o relatório também tenta, senão
 * acusaria falta de um arquivo que o pdflatex acharia sozinho. Ordem do `\DeclareGraphicsExtensions`
 * padrão do pdftex, com `.jpeg` a mais porque o acervo tem imagem colada de clipboard.
 */
const GRAPHICS_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".eps"] as const;

const hasExtension = (relativePath: string): boolean =>
  /\.[A-Za-z0-9]{1,5}$/.test(path.posix.basename(relativePath));

export type MissingAssetReason =
  /** O caminho resolveu, e não há arquivo nenhum lá. O caso comum. */
  | "arquivo-ausente"
  /** Absoluto ou com `..`: aponta para fora da pasta da questão, que é o único lugar que o import copia. */
  | "caminho-escapa-da-pasta"
  /** Alternativa cuja `IdQuestao` não existe em `Questao` — sem a dona, não há pasta onde procurar. */
  | "questao-dona-desconhecida";

export interface MissingLegacyAsset {
  readonly legacyQuestionId: number;
  readonly idPublication: number | null;
  /** Coluna de origem: `latexQuestao`, ou `Questao_Itens.<id>.latexItem` quando veio de alternativa. */
  readonly field: string;
  /** O caminho como o LaTeX escreveu. */
  readonly ref: string;
  /** Onde se procurou, quando deu para calcular. */
  readonly expectedPath: string | null;
  readonly reason: MissingAssetReason;
}

export interface MissingLegacyAssetsReport {
  readonly libraryDir: string;
  /** Referências distintas encontradas no LaTeX (a mesma figura citada duas vezes conta uma). */
  readonly refs: number;
  readonly questionsWithRefs: number;
  readonly missing: readonly MissingLegacyAsset[];
}

export interface ReportMissingLegacyAssetsOptions {
  /** Pasta que contém as `pub<N>/` — o `dirname` do `.knowchico`, não o arquivo. */
  readonly libraryDir: string;
}

interface QuestionRefs {
  readonly legacyQuestionId: number;
  readonly idPublication: number | null;
  readonly refs: readonly LegacyAssetRef[];
}

/**
 * Agrupa por questão porque a pasta no disco é por questão: a figura de uma alternativa mora em
 * `idQuestion<IdQuestao da questão dona>`, nunca numa pasta da alternativa — conferido no acervo
 * (Fundamentos, alternativas 6 e 7 da questão 10, em `pub0000000001/idQuestion10/images/`).
 */
function refsByQuestion(contents: LegacyLibraryContents): readonly QuestionRefs[] {
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
      // Deduplicado por caminho: o relatório é lista de arquivos a caçar, e o mesmo arquivo
      // citado no enunciado e na resposta é uma caçada só. Fica a primeira citação, que é a que
      // a pessoa vai achar primeiro abrindo a questão.
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

async function resolves(
  fs: LegacyFsProbe,
  questionDir: string,
  relativePath: string,
): Promise<boolean> {
  const target = path.posix.join(questionDir, relativePath);
  if (await fs.exists(target)) return true;
  if (hasExtension(relativePath)) return false;

  for (const extension of GRAPHICS_EXTENSIONS) {
    if (await fs.exists(`${target}${extension}`)) return true;
  }
  return false;
}

export async function reportMissingLegacyAssets(
  contents: LegacyLibraryContents,
  fs: LegacyFsProbe,
  options: ReportMissingLegacyAssetsOptions,
): Promise<MissingLegacyAssetsReport> {
  const grouped = refsByQuestion(contents);
  const missing: MissingLegacyAsset[] = [];
  let refs = 0;

  for (const question of grouped) {
    refs += question.refs.length;

    for (const ref of question.refs) {
      const base = {
        legacyQuestionId: question.legacyQuestionId,
        idPublication: question.idPublication,
        field: ref.field,
        ref: ref.raw,
      } as const;

      if (question.idPublication === null) {
        missing.push({ ...base, expectedPath: null, reason: "questao-dona-desconhecida" });
        continue;
      }

      if (ref.escapesQuestionDir) {
        missing.push({ ...base, expectedPath: null, reason: "caminho-escapa-da-pasta" });
        continue;
      }

      const questionDir = path.posix.join(
        options.libraryDir,
        legacyQuestionAssetDir(question.idPublication, question.legacyQuestionId),
      );

      if (await resolves(fs, questionDir, ref.relativePath)) continue;

      missing.push({
        ...base,
        expectedPath: path.posix.join(questionDir, ref.relativePath),
        reason: "arquivo-ausente",
      });
    }
  }

  return {
    libraryDir: options.libraryDir,
    refs,
    questionsWithRefs: grouped.length,
    missing,
  };
}
