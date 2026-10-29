/**
 * Descartar um recorte da fila de captura.
 *
 * Um recorte rejeitado é uma seleção errada na página, não patrimônio: a âncora e o crop saem, e a
 * **fonte** (o PDF, a imagem) continua intacta — recortar de novo é sempre possível (D29).
 *
 * A recusa é a regra que importa: um recorte que já virou questão (ou nó) é a origem de um dado do
 * acervo, e apagá-lo deixaria a questão sem poder responder de onde veio. A decisão "em uso" morava
 * no adaptador Prisma (STM-04); aqui ela é do caso de uso, e o adaptador só diz o que encontrou.
 */

export interface CaptureDiscarder {
  /** Se a âncora existe e se algo do acervo já a usa; `null` quando ela não existe mais. */
  usageOf(anchorId: string): Promise<{ readonly inUse: boolean } | null>;
  /** Apaga a âncora e o crop dela — o crop só quando nenhuma outra âncora o usa (#254). */
  discard(anchorId: string): Promise<void>;
}

export class CaptureNotFoundError extends Error {
  constructor(readonly anchorId: string) {
    super("Este recorte não está mais na fila.");
    this.name = "CaptureNotFoundError";
  }
}

export class CaptureInUseError extends Error {
  constructor(readonly anchorId: string) {
    super("Este recorte é a origem de uma questão. Exclua a questão se quiser descartá-lo.");
    this.name = "CaptureInUseError";
  }
}

export async function discardCapture(store: CaptureDiscarder, anchorId: string): Promise<void> {
  const usage = await store.usageOf(anchorId);
  if (usage === null) throw new CaptureNotFoundError(anchorId);
  if (usage.inUse) throw new CaptureInUseError(anchorId);

  await store.discard(anchorId);
}
