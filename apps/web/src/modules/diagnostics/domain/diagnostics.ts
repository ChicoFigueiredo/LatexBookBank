/**
 * O que a tela de diagnóstico mostra.
 *
 * Os tipos moram no domínio porque atravessam a fronteira servidor→cliente, e o que atravessa não
 * pode morar num módulo `server-only`. É a terceira vez que o teste de fronteira aponta esse
 * mesmo desenho — e continua tendo razão: um `import type` some no build, mas a garantia passa a
 * depender de erasure, e nada avisa quando alguém troca o `type` por um import de valor.
 *
 * Ver spec §25 · issue #119.
 */

/**
 * Três estados, não dois.
 *
 * `unconfigured` e `off` parecem a mesma coisa num indicador binário e mandam a pessoa procurar
 * em lugares opostos: o primeiro se resolve editando `.env.local`, o segundo subindo um processo.
 */
export type Health = "ok" | "off" | "unconfigured";

export interface SectionStatus {
  readonly health: Health;
  readonly summary: string;
  readonly details: readonly { readonly label: string; readonly value: string }[];
}

export interface Diagnostics {
  readonly app: SectionStatus;
  readonly database: SectionStatus;
  readonly storage: SectionStatus;
  readonly renderer: SectionStatus;
  readonly ai: SectionStatus;
  readonly backup: SectionStatus;
}
