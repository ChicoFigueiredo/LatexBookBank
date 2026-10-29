import {
  deduplicarColisoes,
  type ConflitoDeImportacao,
  type ImportCollision,
} from "../domain/import-conflicts";
import {
  DEFAULT_ARCHIVE_LIMITS,
  readArchive,
  type ArchiveAsset,
  type ArchiveLimits,
} from "../domain/portable-archive";
import type { PortableManifest, PortableWorkspace } from "../domain/portable-schema";
import { toRuntime, type ExistingIndex, type ImportPlan } from "./import-workspace";

/**
 * Importar um `.lbb`: ler, simular contra o destino e — se for o caso — gravar.
 *
 * **A decisão sobre colisão é do servidor** (SPA-10, #270). A rota gravava sempre que não fosse
 * `dryRun`, e "colisão exige decisão" valia só porque a tela abria um modal antes: um script, o
 * backup restaurando ou um segundo cliente fazia POST do mesmo arquivo e nascia uma duplicata sem
 * ninguém ter decidido nada. Agora, com colisão, gravar exige `acceptCollisions`; sem ele a
 * resposta é a lista de conflitos e nada é gravado.
 *
 * Ver spec §7 · issue #117 · #270.
 */

export interface ImportReport {
  readonly workspaceId: string;
  readonly publications: number;
  readonly nodes: number;
  readonly questions: number;
  readonly options: number;
  readonly assets: number;
  /** Assets que o dado referencia e o arquivo não trouxe. */
  readonly missingAssets: readonly string[];
  readonly tags: number;
}

export interface ImportArchivePorts {
  readonly readIndex: () => Promise<ExistingIndex>;
  readonly describeConflicts: (
    collisions: readonly ImportCollision[],
    portable: PortableWorkspace,
  ) => Promise<readonly ConflitoDeImportacao[]>;
  readonly write: (plan: ImportPlan, assets: readonly ArchiveAsset[]) => Promise<ImportReport>;
}

export interface ImportDecision {
  /** Só simular: ler, comparar com o destino e não gravar nada. */
  readonly dryRun: boolean;
  /** A pessoa viu os conflitos e escolheu importar mesmo assim — uma cópia ao lado. */
  readonly acceptCollisions: boolean;
}

interface Seen {
  readonly manifest: PortableManifest;
  /** Uma linha por item, não por chave — o que a tela mostra. */
  readonly conflicts: readonly ConflitoDeImportacao[];
  /** Uma por chave que bateu — o que o domínio detectou. */
  readonly collisions: readonly ImportCollision[];
}

export type ImportArchiveOutcome =
  | (Seen & { readonly kind: "simulated" })
  | (Seen & { readonly kind: "needs-decision" })
  | (Seen & { readonly kind: "imported"; readonly report: ImportReport });

export async function importArchive(
  bytes: Uint8Array,
  decision: ImportDecision,
  ports: ImportArchivePorts,
  limits: ArchiveLimits = DEFAULT_ARCHIVE_LIMITS,
): Promise<ImportArchiveOutcome> {
  const { manifest, workspace, assets } = await readArchive(bytes, limits);
  const plan = toRuntime(workspace, await ports.readIndex());

  // Uma linha por item, não por chave: um livro que casa por `legacyId` **e** por `legacyUuid`
  // produz duas colisões, e "2 conflitos" para um livro só faz procurar o segundo que não há.
  const conflicts = await ports.describeConflicts(deduplicarColisoes(plan.collisions), workspace);
  const seen: Seen = { manifest, conflicts, collisions: plan.collisions };

  if (decision.dryRun) return { ...seen, kind: "simulated" };
  if (plan.collisions.length > 0 && !decision.acceptCollisions) {
    return { ...seen, kind: "needs-decision" };
  }

  return { ...seen, kind: "imported", report: await ports.write(plan, assets) };
}
