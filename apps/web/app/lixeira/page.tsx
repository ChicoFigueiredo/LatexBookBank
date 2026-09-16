import { readGlobalTrash } from "@modules/document-tree/infrastructure/prisma-global-trash";
import { relativeTime } from "@/shared/format/relative-time";

import { TrashScreen } from "./trash-screen";

/**
 * A lixeira do acervo (protótipo, 1889–1921) — tela de sistema, no rail.
 *
 * Server Component: o read model roda aqui e só DTO atravessa. O "há 3 h" é formatado **no
 * servidor** de propósito — tempo relativo formatado no cliente foi o defeito que travava a Home
 * inteira na virada do minuto, e esta tela tem uma data por linha.
 */
export const dynamic = "force-dynamic";

export default async function TrashPage() {
  const trash = await readGlobalTrash();
  const agora = new Date();

  return (
    <TrashScreen
      items={trash.items.map((item) => ({
        id: item.id,
        publicationId: item.publicationId,
        title: item.title,
        kind: item.kind,
        where: item.where,
        libraryName: item.libraryName,
        deletedLabel: relativeTime(item.deletedAt, agora),
        restoresCount: item.restoresCount,
        took: item.took,
      }))}
      footer={trash.footer}
      objectCount={trash.objectCount}
    />
  );
}
