import { listPublicationCatalog } from "@modules/publications/infrastructure/prisma-publication-catalog";

import { PublicationsScreen } from "./publications-screen";

/**
 * Todas as publicações do acervo, da mais recente à mais antiga.
 *
 * Existe porque o rail tem "Publicações" e "Captura" — e capturar exige um livro aberto. Sem esta
 * tela, clicar em Captura sem publicação corrente levaria a lugar nenhum (§81).
 */
export const dynamic = "force-dynamic";

export default async function PublicationsPage() {
  const catalog = await listPublicationCatalog();

  return (
    <PublicationsScreen
      publications={catalog.map((entry) => ({
        ...entry,
        updatedAt: entry.updatedAt.toISOString(),
      }))}
    />
  );
}
