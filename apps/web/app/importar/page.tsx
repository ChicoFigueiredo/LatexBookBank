import { PrismaLibraryRepository } from "@modules/workspaces/infrastructure/prisma-library-repository";

import { ImportScreen } from "./import-screen";

/**
 * Importar e exportar (protótipo, 1829–1888) — tela de sistema.
 *
 * A rota `POST /api/workspaces/import` existia desde a Fase 13 e **nenhuma tela a usava** — o que
 * a §49 do prompt do time chama pelo nome: endpoint pronto, jornada inexistente. Quem quisesse
 * restaurar um acervo precisava de `curl`.
 *
 * A exportação estava só no cabeçalho de cada biblioteca. O protótipo a põe **também** aqui, e
 * está certo: quem chega em "importar e exportar" veio pensando em portabilidade, não em uma
 * biblioteca específica.
 */
export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const libraries = await new PrismaLibraryRepository().list();

  return (
    <ImportScreen libraries={libraries.map(({ id, name }) => ({ id, name }))} />
  );
}
