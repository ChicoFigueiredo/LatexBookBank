import { ScanRunNotFoundError } from "./control-scan";
import type { ScanStore } from "./scan-store";
import { startScan, type StartScanCommand } from "./start-scan";

/**
 * Varrer de novo com outro perfil, herdando a revisão
 * ([ADR 0009](../../../../docs/adr/0009-trocar-de-perfil-herda-a-revisao.md)).
 *
 * É execução **nova**, e não a mesma trocando de perfil: o `profileId` entra na `runKey`, e
 * recalculá-la faria a execução mudar de identidade no meio da vida — a chave passaria a dizer
 * `exam-enem-v1` sobre páginas que o `book-v1` leu. Nova execução mantém a chave honesta e deixa
 * as duas propostas lado a lado, que é o que quem está afinando perfil quer ver.
 *
 * O intervalo e as opções vêm da execução anterior: trocar de perfil é trocar **só** o perfil.
 */
export async function switchProfile(
  deps: Parameters<typeof startScan>[0] & { readonly store: ScanStore },
  command: { readonly runId: string; readonly profileId: string },
) {
  const previous = await deps.store.findRun(command.runId);
  if (!previous) throw new ScanRunNotFoundError(command.runId);

  const next: StartScanCommand = {
    publicationId: previous.publicationId,
    profileId: command.profileId,
    pageFrom: previous.settings.pageFrom,
    pageTo: previous.settings.pageTo,
    useAi: previous.settings.useAi,
    recognizeMath: previous.settings.recognizeMath,
    inheritFrom: previous.id,
  };

  return await startScan(deps, next);
}
