import { notFound } from "next/navigation";

import { AssessmentBuilder } from "@modules/assessments/ui/AssessmentBuilder";
import { findAssessment } from "@modules/assessments/infrastructure/prisma-assessment-repository";
import { listCandidateQuestions } from "@modules/assessments/infrastructure/prisma-assessment-repository";
import { PageHeader } from "@/design-system";

/**
 * Montar uma prova.
 *
 * As candidatas vêm do servidor já resumidas: a tela precisa dizer **qual** questão está sendo
 * acrescentada, e um id não diz. Mandar o acervo inteiro para mostrar oitenta caracteres por
 * linha seria pagar o acervo por item de lista.
 *
 * Ver spec §20 · issue #143.
 */

export const dynamic = "force-dynamic";

export default async function AssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const assessment = await findAssessment(id);
  if (assessment === null) notFound();

  const candidates = await listCandidateQuestions(id);

  return (
    <main>
      <PageHeader
        eyebrow="avaliação"
        title={assessment.title}
        meta="Escolha as questões, defina a seed e gere as três versões da mesma variante."
      />
      <AssessmentBuilder assessmentId={id} candidates={candidates} />
    </main>
  );
}
