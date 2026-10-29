import type { ImportCollision, ImportConflict } from "../domain/import-conflicts";
import type { PortableManifest } from "../domain/portable-schema";
import type { ImportReport } from "./import-archive";

/**
 * O contrato HTTP de `POST /api/workspaces/import`, do jeito que a tela o lê.
 *
 * Só tipos, sem nada de servidor: a rota anota a resposta com eles (`satisfies`) e o cliente
 * (`portability/ui/import-client.ts`) importa os mesmos (ADR 0010).
 */

/** O que o servidor viu no arquivo, venha a resposta da simulação, da gravação ou da recusa. */
export interface ImportSeen {
  readonly manifest: PortableManifest;
  /** Uma linha por item, não por chave — o que a tela mostra. */
  readonly conflicts: readonly ImportConflict[];
  /** Uma por chave que bateu — o que o domínio detectou. */
  readonly collisions: readonly ImportCollision[];
}

/** `?dryRun=1`, 200: o ensaio, sem gravar nada. */
export interface ImportSimulationResponse extends ImportSeen {
  readonly dryRun: true;
  /** O que a gravação criaria: as contagens do manifesto. */
  readonly wouldCreate: PortableManifest["counts"];
  readonly sizeBytes: number;
}

/** Sem `dryRun`, 200: a biblioteca nova foi gravada. */
export interface ImportArchiveResponse extends ImportSeen {
  readonly dryRun: false;
  readonly report: ImportReport;
}

/** 409: o arquivo colide com o acervo e a gravação veio sem `acceptCollisions=1` (#270). */
export interface ImportNeedsDecisionBody extends ImportSeen {
  readonly error: "collisions_need_decision";
  readonly message: string;
}
