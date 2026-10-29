/**
 * Quando uma questão pode entrar numa prova.
 *
 * Duas recusas, e elas significam coisas diferentes para quem monta a prova:
 *
 * - **de outra biblioteca** (#177) é engano, e caro: `AssessmentItem → Question` é
 *   `onDelete: Restrict`, então a prova da biblioteca A passaria a travar a exclusão de uma questão
 *   da B — e quem tenta apagar não tem como descobrir por quê, porque a prova que segura não
 *   aparece em lugar nenhum do acervo dele;
 * - **na lixeira** (#263) é estado: a aba aberta antes da exclusão ainda oferece o botão, e a prova
 *   sairia impressa com a questão que a pessoa excluiu.
 *
 * A regra morava no adaptador Prisma e só podia ser testada contra o banco (STM-04). O adaptador
 * continua respondendo os fatos — numa consulta só, para não ler dois estados diferentes —; quem
 * decide é esta função.
 */

/** O que o acervo sabe da questão, visto de uma prova. */
export type QuestionStanding =
  { readonly kind: "foreign" } | { readonly kind: "own"; readonly inTrash: boolean };

export type AdmissionRefusal = "foreign" | "in_trash";

export function admissionRefusal(standing: QuestionStanding): AdmissionRefusal | null {
  if (standing.kind === "foreign") return "foreign";
  return standing.inTrash ? "in_trash" : null;
}
