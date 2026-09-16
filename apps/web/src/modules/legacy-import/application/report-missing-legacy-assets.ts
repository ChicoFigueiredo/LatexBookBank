import path from "node:path";

import {
  legacyAssetRefsByQuestion,
  legacyQuestionAssetDir,
  locateLegacyAsset,
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

export async function reportMissingLegacyAssets(
  contents: LegacyLibraryContents,
  fs: LegacyFsProbe,
  options: ReportMissingLegacyAssetsOptions,
): Promise<MissingLegacyAssetsReport> {
  const grouped = legacyAssetRefsByQuestion(contents);
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

      if ((await locateLegacyAsset(fs, questionDir, ref.relativePath)) !== null) continue;

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
