import { optionLabelAt } from "@modules/questions/domain/question-type";

import { parseLatexPreview } from "./parse-latex-preview";
import type { PreviewModel, PreviewOption } from "./preview-model";

/**
 * `QuestionAggregate → PreviewModel`, o primeiro passo do pipeline da spec §11.
 *
 * A entrada é descrita aqui, e não importada do módulo de questões, de propósito: o preview
 * precisa de quatro campos de texto e de uma lista de alternativas, e amarrá-lo ao agregado
 * inteiro faria qualquer mudança no schema de questões bater numa camada que não tem nada a ver
 * com isso.
 */

export interface PreviewSourceOption {
  readonly statementLatex: string;
  readonly isCorrect: boolean;
}

export interface PreviewSource {
  readonly statementLatex: string;
  readonly solutionLatex: string;
  readonly complementLatex: string;
  /** Já na ordem de `sortKey` — quem ordena é o repositório, não o preview. */
  readonly options: readonly PreviewSourceOption[];
}

/**
 * A letra da alternativa vem do módulo de questões.
 *
 * Ela **já existia lá** (`optionLabelAt`), e eu escrevi uma segunda cópia aqui sem perceber — e
 * quase uma terceira dentro do plugin de múltipla escolha. Três implementações da mesma regra é
 * como uma delas passa a divergir e ninguém descobre qual está certa.
 *
 * O lugar dela é o domínio de questões: a regra é de lá (D9, spec §8.5 — a letra é projeção da
 * ordem, nunca identidade), e o preview é só mais um consumidor.
 */
export { optionLabelAt as optionLetter } from "@modules/questions/domain/question-type";

export function buildPreviewModel(source: PreviewSource): PreviewModel {
  const options: PreviewOption[] = source.options.map((option, index) => ({
    letter: optionLabelAt(index),
    blocks: parseLatexPreview(option.statementLatex),
    isCorrect: option.isCorrect,
  }));

  return {
    statement: parseLatexPreview(source.statementLatex),
    options,
    solution: parseLatexPreview(source.solutionLatex),
    complement: parseLatexPreview(source.complementLatex),
  };
}
