import type { AssessmentQuestionContent } from "../domain/assessment-template";
import {
  admissionRefusal,
  type AdmissionRefusal,
  type QuestionStanding,
} from "../domain/admission";
import type { Variant } from "../domain/variant";
import {
  composeVariant,
  composeVersions,
  type AssessmentRecord,
  type ComposedVersions,
  type VariantSpec,
} from "./compose-assessment";

/**
 * As escritas da avaliação: criar, acrescentar e tirar questão, sortear variante, apagar.
 *
 * Moravam na rota e no adaptador Prisma, e a regra só podia ser testada contra o banco (STM-04,
 * STE-03). A trava das variantes, que protege o gabarito de uma prova já impressa, existia só na
 * rota: um script que chamasse o `deleteAssessment` do adaptador passava por fora dela. Aqui as
 * regras ficam num lugar que qualquer caminho — rota, agente, script — atravessa.
 *
 * Ver spec §20 · D9 · issues #143, #177, #263.
 */

/**
 * O que o caso de uso precisa do acervo. O adaptador responde fatos; as decisões são daqui e do
 * domínio.
 */
export interface AssessmentStore {
  create(input: NewAssessment): Promise<{ readonly id: string }>;
  find(assessmentId: string): Promise<AssessmentRecord | null>;
  /** A questão vista da prova, numa consulta só; `null` quando a prova não existe. */
  standingOf(assessmentId: string, questionId: string): Promise<QuestionStanding | null>;
  /** Põe no fim da primeira seção. `already` quando ela já estava; `no_section` se não há seção. */
  appendItem(assessmentId: string, questionId: string): Promise<"added" | "already" | "no_section">;
  removeItem(assessmentId: string, questionId: string): Promise<void>;
  /** As letras das variantes já sorteadas; `null` quando a prova não existe. */
  variantLabelsOf(assessmentId: string): Promise<readonly string[] | null>;
  /** Seções, itens, variantes e mapas de letra vão junto. A questão nunca é tocada. */
  delete(assessmentId: string): Promise<void>;
  contentFor(questionIds: readonly string[]): Promise<Record<string, AssessmentQuestionContent>>;
  saveVariant(
    assessmentId: string,
    variant: Variant,
    spec: { readonly shuffleQuestions: boolean; readonly shuffleOptions: boolean },
  ): Promise<{ readonly id: string }>;
}

export interface NewAssessment {
  readonly workspaceId: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly notes: string | null;
}

export class AssessmentNotFoundError extends Error {
  constructor(readonly assessmentId: string) {
    super("Esta avaliação não existe.");
    this.name = "AssessmentNotFoundError";
  }
}

/**
 * Apagar destruiria o gabarito de variantes já sorteadas.
 *
 * O mapa de letras de uma variante **é** o gabarito de uma prova que pode já ter sido impressa e
 * entregue à turma; apagá-lo destrói a única cópia de como aquela prova foi embaralhada, e a seed
 * sozinha não a reconstrói — ela reproduz a permutação apenas enquanto a questão tiver exatamente
 * as mesmas alternativas (§17). O pedido é válido; é o estado que exige alguém dizer sim sabendo
 * o que perde.
 */
export class VariantsWouldBeLostError extends Error {
  constructor(readonly variantLabels: readonly string[]) {
    super(
      `Esta avaliação tem ${variantLabels.length} variante(s) sorteada(s) (${variantLabels.join(", ")}). ` +
        "O mapa de letras delas é o gabarito, e apagá-lo não tem volta — a seed sozinha não " +
        "reconstrói a prova se as alternativas mudarem.",
    );
    this.name = "VariantsWouldBeLostError";
  }
}

export function createAssessment(store: AssessmentStore, input: NewAssessment) {
  return store.create(input);
}

/**
 * O resultado de acrescentar.
 *
 * Todo `added: false` carrega o motivo, e eles significam coisas opostas para quem monta a prova:
 * "já estava" é um clique repetido; "é de outra biblioteca" é um engano que precisa aparecer.
 */
export type AddQuestionResult =
  | { readonly added: true }
  | { readonly added: false; readonly reason: "already" | "no_section" | AdmissionRefusal };

export async function addQuestionToAssessment(
  store: AssessmentStore,
  assessmentId: string,
  questionId: string,
): Promise<AddQuestionResult> {
  const standing = await store.standingOf(assessmentId, questionId);
  if (standing === null) throw new AssessmentNotFoundError(assessmentId);

  const refusal = admissionRefusal(standing);
  if (refusal !== null) return { added: false, reason: refusal };

  const outcome = await store.appendItem(assessmentId, questionId);
  return outcome === "added" ? { added: true } : { added: false, reason: outcome };
}

/** Referência, nunca cópia: tirar da prova não toca na questão. */
export function removeQuestionFromAssessment(
  store: AssessmentStore,
  assessmentId: string,
  questionId: string,
): Promise<void> {
  return store.removeItem(assessmentId, questionId);
}

/**
 * Apaga a prova. Com variante sorteada, só com `confirmVariants` — e a resposta diz quais se foram.
 */
export async function deleteAssessment(
  store: AssessmentStore,
  assessmentId: string,
  options: { readonly confirmVariants: boolean },
): Promise<{ readonly deleted: true; readonly variantLabels: readonly string[] }> {
  const variantLabels = await store.variantLabelsOf(assessmentId);
  if (variantLabels === null) throw new AssessmentNotFoundError(assessmentId);
  if (variantLabels.length > 0 && !options.confirmVariants) {
    throw new VariantsWouldBeLostError(variantLabels);
  }

  await store.delete(assessmentId);
  return { deleted: true, variantLabels };
}

/**
 * Sorteia uma variante e guarda **o mapa de letras**.
 *
 * O sorteio acontece uma vez e alimenta as três versões. Sortear por versão daria três provas
 * diferentes com o mesmo nome, que é o pior defeito possível numa prova, porque só aparece na
 * correção.
 */
export async function drawVariant(
  store: AssessmentStore,
  assessmentId: string,
  spec: VariantSpec,
): Promise<{ readonly variant: Variant; readonly versions: ComposedVersions }> {
  const assessment = await store.find(assessmentId);
  if (assessment === null) throw new AssessmentNotFoundError(assessmentId);

  const content = await store.contentFor(assessment.items.map((item) => item.questionId));
  const variant = composeVariant(assessment, spec, content);
  const versions = composeVersions(assessment, variant, content);

  await store.saveVariant(assessmentId, variant, spec);
  return { variant, versions };
}
