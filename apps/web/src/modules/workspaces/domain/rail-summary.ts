/**
 * As contagens do rail — o **contrato**, sem banco.
 *
 * Separado do read model por um motivo que já custou uma tela branca: o provedor de contexto é um
 * Client Component e precisa do valor default. Importá-lo de um módulo `server-only` arrasta o
 * Prisma para o bundle do cliente, e o Next recusa a página inteira — não com um aviso, com um
 * 500. O tipo e o zero moram aqui, onde os dois lados podem lê-los; a consulta mora no servidor.
 */

export interface RailSummary {
  readonly libraries: number;
  readonly publications: number;
  /** Recortes esperando virar questão. É o único que ganha tom de aviso. */
  readonly captureQueue: number;
  /** O que está na lixeira, em objetos. `0` esconde o badge — lixeira vazia não é pendência. */
  readonly trash: number;
}

export const EMPTY_RAIL_SUMMARY: RailSummary = {
  libraries: 0,
  publications: 0,
  captureQueue: 0,
  trash: 0,
};
