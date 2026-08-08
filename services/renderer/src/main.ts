import { startServer } from "./server.ts";

/**
 * Ponto de entrada do contêiner.
 *
 * Separado de `server.ts` para que importar o roteador num teste não suba porta nenhuma — e para
 * que `requireSecret` só derrube o processo em quem está de fato subindo o worker.
 */
startServer();
