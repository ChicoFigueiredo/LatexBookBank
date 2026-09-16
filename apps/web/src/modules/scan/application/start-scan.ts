import { captureProfile } from "@modules/scan/domain/profiles";
import {
  ENGINE_VERSION,
  isInProgress,
  normalizeSettings,
  runKeySource,
} from "@modules/scan/domain/scan-run";

import type { ScanRun, ScanRunner, ScanSourceReader, ScanStore } from "./scan-store";

/**
 * Pedir um scan (D49, D53).
 *
 * Rodar de novo com o mesmo arquivo, perfil, versão e configuração **reabre** a execução que já
 * existe — em andamento, pronta ou aprovada —, em vez de criar outra proposta igual ao lado. Só
 * `forceNew` cria outra; uma execução que falhou ou foi cancelada não é reaberta.
 */

export class UnknownCaptureProfileError extends Error {
  constructor(readonly profileId: string) {
    super(`Perfil de captura desconhecido: ${profileId}.`);
    this.name = "UnknownCaptureProfileError";
  }
}

export class NoSourcePdfError extends Error {
  constructor(readonly publicationId: string) {
    super("Este livro não tem PDF fonte. Anexe um antes de rodar o scan.");
    this.name = "NoSourcePdfError";
  }
}

export interface StartScanCommand {
  readonly publicationId: string;
  readonly profileId: string;
  readonly pageFrom?: unknown;
  readonly pageTo?: unknown;
  readonly useAi?: unknown;
  readonly recognizeMath?: unknown;
  readonly forceNew?: boolean;
}

export async function startScan(
  deps: {
    readonly store: ScanStore;
    readonly sources: ScanSourceReader;
    readonly runner: ScanRunner;
    readonly sha256: (text: string) => Promise<string>;
  },
  command: StartScanCommand,
): Promise<{ readonly run: ScanRun; readonly reused: boolean }> {
  const profile = captureProfile(command.profileId);
  if (!profile) throw new UnknownCaptureProfileError(command.profileId);

  const settings = normalizeSettings(command);
  const source = await deps.sources.sourceFor(command.publicationId);
  if (!source) throw new NoSourcePdfError(command.publicationId);

  const runKey = await deps.sha256(
    runKeySource({
      sourceSha256: source.sha256,
      profileId: profile.id,
      profileVersion: profile.version,
      engineVersion: ENGINE_VERSION,
      settings,
    }),
  );

  if (!command.forceNew) {
    const existing = await deps.store.findLatestByKey(command.publicationId, runKey);
    if (existing && existing.state !== "FAILED" && existing.state !== "CANCELLED") {
      if (isInProgress(existing.state)) deps.runner.ensure(existing.id);
      return { run: existing, reused: true };
    }
  }

  const run = await deps.store.createRun({
    workspaceId: source.workspaceId,
    publicationId: command.publicationId,
    sourceAssetId: source.assetId,
    profileId: profile.id,
    profileVersion: profile.version,
    engineVersion: ENGINE_VERSION,
    settings,
    runKey,
    pageFrom: settings.pageFrom,
    pageTo: settings.pageTo ?? 0,
  });

  await deps.sources.rememberProfile(command.publicationId, profile.id);
  deps.runner.ensure(run.id);

  return { run, reused: false };
}
