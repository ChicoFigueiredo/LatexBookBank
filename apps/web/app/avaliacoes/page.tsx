import { notFound } from "next/navigation";

import { listWorkspaces } from "@modules/workspaces/infrastructure/prisma-workspace-list";
import { listAssessments } from "@modules/assessments/infrastructure/prisma-assessment-repository";

import { AssessmentsScreen } from "./assessments-screen";

/**
 * As avaliações da biblioteca escolhida.
 *
 * Server Component: o repositório roda aqui e só DTO atravessa. A lista mostra a contagem de
 * questões e as variantes já sorteadas — é o que se precisa saber para decidir qual abrir.
 *
 * **A biblioteca vem da URL** (`?biblioteca=slug`, #261). A tela pegava `listWorkspaces()[0]`, e
 * com treze bibliotecas só a primeira em ordem alfabética tinha avaliação: as provas das outras não
 * apareciam, e toda prova nova nascia nela. Sem o parâmetro, a primeira da lista continua sendo o
 * ponto de partida — o rail leva para `/avaliacoes` sem saber de biblioteca —, mas agora com o
 * seletor à vista. Um slug que não existe é 404: cair em outra biblioteca em silêncio é
 * exatamente o defeito que este arquivo corrige.
 *
 * Ver spec §20 · issue #143 · #261.
 */

export const dynamic = "force-dynamic";

export default async function AssessmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const wanted = (await searchParams)["biblioteca"];
  const slug = typeof wanted === "string" && wanted !== "" ? wanted : null;

  // Ordem de leitura, não de byte: o SQLite ordena "Álgebra" depois de "Vazia".
  const libraries = [...(await listWorkspaces())].sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR"),
  );

  const library =
    slug === null
      ? (libraries[0] ?? null)
      : (libraries.find((entry) => entry.slug === slug) ?? null);
  if (slug !== null && library === null) notFound();

  const assessments = library === null ? [] : await listAssessments(library.id);

  return <AssessmentsScreen libraries={libraries} library={library} assessments={assessments} />;
}
