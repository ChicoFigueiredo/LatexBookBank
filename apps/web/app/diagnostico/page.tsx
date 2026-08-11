import { collectDiagnostics } from "@modules/diagnostics/application/collect-diagnostics";
import { DiagnosticsView } from "@modules/diagnostics/ui/DiagnosticsView";
import { listWorkspaces } from "@modules/workspaces/infrastructure/prisma-workspace-list";

/**
 * A página de diagnóstico.
 *
 * Server Component: tudo que ela mostra vem de variável de ambiente, do sistema de arquivos ou de
 * uma sondagem HTTP — nada disso pode chegar ao cliente. O que atravessa é o **resultado**, já
 * sem chave nem senha.
 *
 * Ver spec §25 · issue #119.
 */
export const dynamic = "force-dynamic";

export default async function DiagnosticsPage() {
  const [diagnostics, workspaces] = await Promise.all([collectDiagnostics(), listWorkspaces()]);

  return <DiagnosticsView diagnostics={diagnostics} workspaces={workspaces} />;
}
