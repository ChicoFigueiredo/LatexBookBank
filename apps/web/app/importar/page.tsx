import { ImportScreen } from "./import-screen";

/**
 * Importar um `.lbb`.
 *
 * A rota `POST /api/workspaces/import` existia desde a Fase 13 e **nenhuma tela a usava** — o que
 * a §49 do prompt do time chama pelo nome: endpoint pronto, jornada inexistente. Quem quisesse
 * restaurar um acervo precisava de `curl`.
 */
export const dynamic = "force-dynamic";

export default function ImportPage() {
  return <ImportScreen />;
}
