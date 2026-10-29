"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { EmptyState, Field, PageHeader, Select } from "@/design-system";

import { useAcervoStyles } from "../acervo-styles";
import { AppShell } from "../app-shell";
import { DeleteAssessment } from "./delete-assessment";
import { NewAssessment } from "./new-assessment";

export interface AssessmentLibrary {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
}

export interface AssessmentListItem {
  readonly id: string;
  readonly title: string;
  readonly questionCount: number;
  readonly variantLabels: readonly string[];
}

/**
 * As avaliações de **uma** biblioteca, escolhida na tela (#261).
 *
 * A biblioteca é explícita porque é a unidade de isolamento do acervo: uma prova só monta com as
 * questões da própria biblioteca, e a tela que escolhia sozinha a primeira em ordem alfabética
 * deixava as outras doze sem como montar prova nenhuma. O seletor troca a biblioteca **pela URL**
 * (`?biblioteca=slug`), para que o endereço diga onde a pessoa está e o voltar do navegador
 * funcione.
 */
export function AssessmentsScreen({
  libraries,
  library,
  assessments,
}: {
  readonly libraries: readonly AssessmentLibrary[];
  readonly library: AssessmentLibrary | null;
  readonly assessments: readonly AssessmentListItem[];
}) {
  useAcervoStyles();
  const router = useRouter();

  return (
    <AppShell
      activeModule="avaliacoes"
      breadcrumb={[{ label: "Avaliações" }, ...(library === null ? [] : [{ label: library.name }])]}
    >
      <div className="lbb-acervo">
        <PageHeader
          eyebrow="PRODUÇÃO"
          title="Avaliações"
          meta={
            library === null
              ? undefined
              : `${assessments.length} ${assessments.length === 1 ? "avaliação" : "avaliações"} em ${library.name}`
          }
          actions={
            library === null ? undefined : (
              <Field label="Biblioteca">
                <Select
                  size="sm"
                  value={library.slug}
                  onChange={(event) =>
                    router.push(`/avaliacoes?biblioteca=${encodeURIComponent(event.target.value)}`)
                  }
                >
                  {libraries.map((entry) => (
                    <option key={entry.id} value={entry.slug}>
                      {entry.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )
          }
        />

        {library === null ? (
          <EmptyState
            icon="library"
            title="Nenhuma biblioteca ainda"
            description="Uma avaliação monta com as questões de uma biblioteca — crie uma primeiro."
            action={<Link href="/bibliotecas">Ir para bibliotecas</Link>}
          />
        ) : (
          <div style={{ display: "grid", gap: "var(--space-4)", marginTop: "var(--space-4)" }}>
            {assessments.length === 0 ? (
              <EmptyState
                icon="clipboard-list"
                title="Nenhuma avaliação nesta biblioteca"
                description="Dê um título à prova; as questões entram depois, escolhidas do acervo desta biblioteca."
                action={<NewAssessment workspaceId={library.id} />}
              />
            ) : (
              <>
                <NewAssessment workspaceId={library.id} />
                <ul style={{ display: "grid", gap: 8, listStyle: "none", padding: 0, margin: 0 }}>
                  {assessments.map((assessment) => (
                    <li
                      key={assessment.id}
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <Link href={`/avaliacoes/${assessment.id}`}>{assessment.title}</Link>{" "}
                      <span className="lbb-card-meta">
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
              </>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
