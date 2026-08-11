import type { BackupConfig } from "./config";

/**
 * Uma rodada de backup: um `.lbb` por workspace, pedido **ao app**.
 *
 * O serviço não lê o banco. A primeira versão importava o exportador direto de `apps/web` e
 * quebrou no `import "server-only"` — que é justamente o guarda avisando: aquele módulo pertence
 * ao servidor do app, e um segundo processo lendo o mesmo banco seria um segundo escritor daquele
 * schema, com credencial própria e migrations fora de sincronia.
 *
 * Pedindo por HTTP, o backup **reutiliza o mesmo `PortableArchiveWriter`** (D36) sem duplicar
 * nada: o arquivo é byte a byte o da exportação manual, então o round-trip que valida uma valida
 * a outra. E o processo não precisa de `DATABASE_URL`, de acesso ao storage nem de saber o que é
 * um workspace — só de um diretório para gravar.
 *
 * Ver D32 · D36 · issue #117.
 */

export interface BackupArchive {
  readonly workspaceId: string;
  readonly slug: string;
  readonly filename: string;
  readonly bytes: Uint8Array;
}

export interface BackupFailure {
  readonly workspaceId: string;
  readonly message: string;
}

export interface BackupOutcome {
  readonly archives: readonly BackupArchive[];
  readonly failures: readonly BackupFailure[];
}

export interface WorkspaceRef {
  readonly id: string;
  readonly slug: string;
}

/** Injetáveis: é o que permite testar a rodada inteira sem app no ar. */
export interface BackupDeps {
  listWorkspaces(): Promise<readonly WorkspaceRef[]>;
  exportWorkspace(id: string): Promise<Uint8Array>;
  now(): Date;
}

export async function backupAll(
  config: BackupConfig,
  deps: BackupDeps = httpDeps(config),
): Promise<BackupOutcome> {
  const archives: BackupArchive[] = [];
  const failures: BackupFailure[] = [];

  for (const workspace of await deps.listWorkspaces()) {
    try {
      const bytes = await deps.exportWorkspace(workspace.id);
      const stamp = deps.now().toISOString().replace(/[:.]/g, "-");

      archives.push({
        workspaceId: workspace.id,
        slug: workspace.slug,
        // `--` como separador: um slug pode ter hífen, e a retenção precisa saber onde o nome
        // termina para agrupar por workspace.
        filename: `${workspace.slug}--${stamp}.lbb`,
        bytes,
      });
    } catch (error) {
      // Um workspace que falha não derruba os outros. Backup parcial com relatório é melhor que
      // nenhum backup — e a falha aparece no estado, que a página de diagnóstico lê.
      failures.push({ workspaceId: workspace.id, message: String(error) });
    }
  }

  return { archives, failures };
}

function httpDeps(config: BackupConfig): BackupDeps {
  return {
    now: () => new Date(),

    listWorkspaces: async () => {
      const response = await fetch(`${config.appBaseUrl}/api/workspaces`);
      if (!response.ok) throw new Error(`o app respondeu ${response.status} ao listar workspaces`);

      const payload = (await response.json()) as { workspaces?: WorkspaceRef[] };
      return payload.workspaces ?? [];
    },

    exportWorkspace: async (id) => {
      const response = await fetch(`${config.appBaseUrl}/api/workspaces/export?workspaceId=${id}`);
      if (!response.ok) throw new Error(`o app respondeu ${response.status} ao exportar ${id}`);

      const missing = response.headers.get("x-lbb-missing-assets");
      if (missing !== null) {
        // O export continua com asset faltando, e é a decisão certa lá. Aqui vira aviso: um
        // backup silenciosamente incompleto é o pior tipo de backup.
        console.warn(`[backup] ${id}: ${missing} asset(s) ausentes no storage`);
      }

      return new Uint8Array(await response.arrayBuffer());
    },
  };
}
