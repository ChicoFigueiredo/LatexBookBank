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
 * A letra da alternativa, **derivada da posição**.
 *
 * D9 é explícita: a letra nunca é identidade. O legado guardava `Marcacao` na linha, e reordenar
 * alternativas deixava o gabarito apontando para a letra errada. Aqui a letra é função do índice,
 * e reordenar não pode produzir inconsistência porque não há nada para ficar inconsistente.
 *
 * Depois de `z` continua em `aa`, que é feio e nunca vai acontecer — mas é melhor do que repetir
 * a letra `a` na alternativa 27 e fazer duas linhas parecerem a mesma.
 */
export function optionLetter(index: number): string {
  let letter = "";
  let n = index;
  do {
    letter = String.fromCharCode(97 + (n % 26)) + letter;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letter;
}

export function buildPreviewModel(source: PreviewSource): PreviewModel {
  const options: PreviewOption[] = source.options.map((option, index) => ({
    letter: optionLetter(index),
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
