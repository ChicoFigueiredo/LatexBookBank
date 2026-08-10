/**
 * Imprime a impressão digital de uma variante. Serve para provar o aceite da Fase 16: a mesma
 * seed precisa dar a mesma prova **em processos diferentes**, e a única forma de verificar isso é
 * rodar dois processos.
 *
 * `bun scripts/print-variant.ts <seed>`
 */

import { buildVariant, fingerprint } from "../src/modules/assessments/domain/variant";

const seed = Number(process.argv[2] ?? 12345);

/** Uma prova de tamanho realista: 12 questões de cinco alternativas. */
const questions = Array.from({ length: 12 }, (_, q) => ({
  questionId: `q-${q}`,
  optionIds: Array.from({ length: 5 }, (_, o) => `q${q}-o${o}`),
  ...(q % 4 === 0 ? { pinnedLastOptionIds: [`q${q}-o4`] } : {}),
}));

const variant = buildVariant({ label: "A", seed, questions, shuffleQuestions: true });

console.log(fingerprint(variant));
