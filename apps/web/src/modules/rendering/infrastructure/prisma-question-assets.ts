import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";
import { assetLatexName, type AssetForLatex } from "@modules/assets/domain/asset-latex-name";
import { isAssetKind, isSourceAsset } from "@modules/assets/domain/asset-kind";
import { asStorageKey, type StorageProvider } from "@/shared/ports";
import type { RenderBundle } from "@latexbookbank/render-contract";

/**
 * As figuras que a questão referencia, prontas para viajar no bundle.
 *
 * O item "assets referenciados corretamente" estava aberto na Fase 6 esperando a Fase 11, e não
 * precisava: a Fase 14 já dá upload e recorte, então a questão **já pode** ter figura hoje. Sem
 * isto, inserir um `\includegraphics` no enunciado produzia LaTeX que não compila — e o erro que
 * aparece é `File not found`, que manda procurar defeito no texto de quem escreveu.
 *
 * **Só o que o LaTeX cita.** Mandar todos os assets da questão engordaria cada compilação com
 * arquivos que o documento não usa — e o PDF de origem de um recorte tem megabytes. O filtro é o
 * próprio corpo: se o nome não aparece nele, o arquivo não vai.
 *
 * Derivado nunca entra: `RENDER_PNG` é saída de compilação, e reenviá-lo como entrada seria pedir
 * ao worker que compilasse o próprio resultado.
 *
 * Ver spec §13 · D35 · issue #173.
 */

export interface ResolvedAssets {
  readonly manifest: RenderBundle["assets"];
  readonly bytes: ReadonlyMap<string, Uint8Array>;
}

const EMPTY: ResolvedAssets = { manifest: [], bytes: new Map() };

export async function loadQuestionAssets(
  questionId: string,
  sourceLatex: string,
  storage: StorageProvider,
): Promise<ResolvedAssets> {
  const rows = await prisma.asset.findMany({
    where: { questionId, renderJobId: null },
    select: {
      storageKey: true,
      mimeType: true,
      sha256: true,
      sizeBytes: true,
      originalFilename: true,
      kind: true,
    },
  });

  if (rows.length === 0) return EMPTY;

  const manifest: RenderBundle["assets"][number][] = [];
  const bytes = new Map<string, Uint8Array>();

  for (const row of rows) {
    if (!isAssetKind(row.kind) || !isSourceAsset(row.kind)) continue;

    const named: AssetForLatex = {
      sha256: row.sha256,
      mimeType: row.mimeType,
      originalFilename: row.originalFilename,
    };
    const name = assetLatexName(named);

    // O corpo é quem decide. Um `indexOf` basta: o nome carrega o hash do conteúdo, então ele não
    // aparece por acidente em texto nenhum.
    if (!sourceLatex.includes(name)) continue;
    if (bytes.has(name)) continue;

    try {
      const content = await storage.get(asStorageKey(row.storageKey));

      bytes.set(name, content.content);
      manifest.push({
        name,
        mimeType: row.mimeType,
        sizeBytes: row.sizeBytes,
        sha256: row.sha256,
      });
    } catch {
      // Asset citado e ausente no storage é problema real, mas derrubar a compilação inteira por
      // causa dele esconderia o resto: o `pdflatex` vai reclamar do arquivo que falta, com o nome
      // dele, e isso é uma mensagem melhor que um 500 desta rota.
      continue;
    }
  }

  return { manifest, bytes };
}
