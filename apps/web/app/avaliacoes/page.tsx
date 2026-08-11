import Link from "next/link";

import { listWorkspaces } from "@modules/workspaces/infrastructure/prisma-workspace-list";
import { listAssessments } from "@modules/assessments/infrastructure/prisma-assessment-repository";

import { DeleteAssessment } from "./delete-assessment";
import { NewAssessment } from "./new-assessment";

/**
 * As avaliações do workspace.
 *
 * Server Component: o repositório roda aqui e só DTO atravessa. A lista mostra a contagem de
 * questões e as variantes já sorteadas — é o que se precisa saber para decidir qual abrir.
 *
 * Ver spec §20 · issue #143.
 */

export const dynamic = "force-dynamic";

export default async function AssessmentsPage() {
  const workspaces = await listWorkspaces();
  const workspace = workspaces[0];

  if (workspace === undefined) {
    return (
      <main style={{ padding: "var(--space-6)" }}>
        <p>Nenhum workspace ainda.</p>
      </main>
    );
  }

  const assessments = await listAssessments(workspace.id);

  return (
    <main style={{ padding: "var(--space-6)", display: "grid", gap: "var(--space-4)" }}>
      <h1>Avaliações</h1>

      <NewAssessment workspaceId={workspace.id} />

      {assessments.length === 0 ? (
        <p>Nenhuma prova montada ainda.</p>
      ) : (
        <ul style={{ display: "grid", gap: 8, listStyle: "none", padding: 0 }}>
          {assessments.map((assessment) => (
            <li key={assessment.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Link href={`/avaliacoes/${assessment.id}`}>{assessment.title}</Link>{" "}
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-micro)" }}>
                {assessment.questionCount} questões
                {assessment.variantLabels.length > 0 &&
                  ` · variantes ${assessment.variantLabels.join(", ")}`}
              </span>
              <span style={{ marginLeft: "auto" }}>
                <DeleteAssessment assessmentId={assessment.id} title={assessment.title} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
