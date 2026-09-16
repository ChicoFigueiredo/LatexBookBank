import type { RawPage } from "@modules/scan/domain/page";
import type { NormalizedBox } from "@modules/assets/domain/source-anchor";

/**
 * O PDF aberto, do ponto de vista do scan.
 *
 * Interface do módulo, e não de `shared/ports`: não é fronteira de infraestrutura nova (D46) —
 * é a forma como o scan usa a biblioteca de PDF que o projeto já tem, e existe para que o caso de
 * uso rode nos testes com páginas sintéticas, sem abrir arquivo nenhum.
 *
 * Aberto **uma vez por execução** (§51 do prompt 03): reabrir o PDF a cada página ou a cada
 * elemento é o que torna um livro de 600 páginas lento sem motivo.
 */
export interface OpenedPdf {
  readonly pageCount: number;
  readPage(pageNumber: number): Promise<RawPage>;
  /** PNG de um trecho da página, para o reconhecimento matemático e para o recorte (D52). */
  renderRegion(pageNumber: number, box: NormalizedBox, dpi: number): Promise<Uint8Array>;
  close(): Promise<void>;
}

export interface PdfDocumentOpener {
  open(bytes: Uint8Array): Promise<OpenedPdf>;
}
