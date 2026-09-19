import type { RawPage } from "@modules/scan/domain/page";
import type { ProposalMetrics, ProposedItem } from "@modules/scan/domain/proposal";
import type { ScanItem } from "@modules/scan/domain/scan-item";
import type { ScanRunState, ScanSettings } from "@modules/scan/domain/scan-run";

/**
 * O que o scan precisa guardar e ler. Interfaces do módulo, como as do `recognition`: a
 * implementação é Prisma, e os casos de uso rodam nos testes com um dublê em memória.
 */

export interface ScanRun {
  readonly id: string;
  readonly workspaceId: string;
  readonly publicationId: string;
  readonly sourceAssetId: string;
  readonly profileId: string;
  readonly profileVersion: number;
  readonly engineVersion: string;
  readonly settings: ScanSettings;
  readonly runKey: string;
  readonly state: ScanRunState;
  readonly cancelRequested: boolean;
  readonly pageFrom: number;
  readonly pageTo: number;
  readonly lastPageRead: number;
  /** O andamento da etapa atual depois da leitura; `stepTotal` 0 é "sem contagem". */
  readonly stepDone: number;
  readonly stepTotal: number;
  readonly aiProviderId: string | null;
  readonly aiModel: string | null;
  readonly mathProviderId: string | null;
  readonly mathModel: string | null;
  readonly aiCalls: number;
  readonly mathCalls: number;
  readonly metrics: ProposalMetrics | null;
  readonly warnings: readonly string[];
  readonly pageOffset: number | null;
  readonly error: string | null;
  readonly heartbeatAt: Date | null;
  readonly startedAt: Date | null;
  readonly finishedAt: Date | null;
  readonly createdAt: Date;
}

export type NewScanRun = Pick<
  ScanRun,
  | "workspaceId"
  | "publicationId"
  | "sourceAssetId"
  | "profileId"
  | "profileVersion"
  | "engineVersion"
  | "settings"
  | "runKey"
  | "pageFrom"
  | "pageTo"
>;

export type ScanRunPatch = Partial<
  Pick<
    ScanRun,
    | "state"
    | "cancelRequested"
    | "pageTo"
    | "lastPageRead"
    | "stepDone"
    | "stepTotal"
    | "aiProviderId"
    | "aiModel"
    | "mathProviderId"
    | "mathModel"
    | "aiCalls"
    | "mathCalls"
    | "metrics"
    | "warnings"
    | "pageOffset"
    | "error"
    | "heartbeatAt"
    | "startedAt"
    | "finishedAt"
  >
>;

export interface ScanItemChanges {
  readonly upserts: readonly ScanItem[];
  readonly deletedIds: readonly string[];
}

export interface ScanStore {
  createRun(run: NewScanRun): Promise<ScanRun>;
  findRun(id: string): Promise<ScanRun | null>;
  /**
   * A execução mais recente do livro com a chave, qualquer estado. Do livro: o mesmo PDF anexado a
   * dois livros são duas varreduras, com destinos diferentes.
   */
  findLatestByKey(publicationId: string, runKey: string): Promise<ScanRun | null>;
  listRuns(publicationId: string): Promise<readonly ScanRun[]>;
  updateRun(id: string, patch: ScanRunPatch): Promise<void>;
  /** Apaga a execução e o que é dela — páginas lidas e proposta. O acervo não é tocado aqui. */
  deleteRun(id: string): Promise<void>;

  savePage(runId: string, page: RawPage): Promise<void>;
  loadPages(runId: string, from: number, to: number): Promise<readonly RawPage[]>;

  /** Grava a proposta montada. Só antes da revisão: substitui o que houver da execução. */
  replaceItems(runId: string, items: readonly ProposedItem[]): Promise<void>;
  listItems(runId: string): Promise<readonly ScanItem[]>;
  /** Uma operação de revisão, inteira ou nada. */
  saveItemChanges(runId: string, changes: ScanItemChanges): Promise<void>;
}

/** O PDF fonte de um livro, do jeito que o scan precisa dele. */
export interface ScanSource {
  readonly workspaceId: string;
  readonly assetId: string;
  readonly storageKey: string;
  readonly sha256: string;
}

export interface ScanSourceReader {
  sourceFor(publicationId: string): Promise<ScanSource | null>;
  /** O livro lembra o perfil que usa (D41). */
  rememberProfile(publicationId: string, profileId: string): Promise<void>;
}

/** Quem executa o laço fora da requisição (D49). */
export interface ScanRunner {
  ensure(runId: string): void;
  isRunning(runId: string): boolean;
}
