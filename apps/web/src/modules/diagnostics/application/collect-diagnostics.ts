import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { profileForBaseUrl } from "@modules/agents/domain/ai-profile";
import type { Diagnostics, SectionStatus } from "@modules/diagnostics/domain/diagnostics";
import { probeHostTex, type HostTex } from "@modules/diagnostics/infrastructure/host-tex";
import {
  renderStats,
  type RenderStats,
} from "@modules/rendering/infrastructure/prisma-render-stats";
import { env as appEnv } from "@/shared/config/env";

/**
 * O que está no ar, e o que não está.
 *
 * A página existe para responder essa pergunta sem ninguém precisar ler o `.env.local` e
 * adivinhar. Cada seção distingue três estados que costumam ser confundidos num só:
 *
 * - **não configurado** — resolve-se editando variável de ambiente;
 * - **configurado e fora do ar** — resolve-se subindo um processo;
 * - **no ar** — não precisa de ninguém.
 *
 * Um indicador binário juntaria os dois primeiros e mandaria a pessoa procurar no lugar errado.
 *
 * Ver spec §25 · issue #119.
 */

/** Um segundo é o bastante: a página não pode ficar presa esperando um serviço morto. */
const PROBE_TIMEOUT_MS = 2_000;

export async function collectDiagnostics(): Promise<Diagnostics> {
  const env = appEnv();

  const [renderer, backup, hostTex, stats] = await Promise.all([
    probeRenderer(env.rendererBaseUrl, env.rendererSecret),
    readBackupStatus(),
    probeHostTex(),
    // O cache é derivado e a consulta é de contagem: falhar aqui não pode derrubar a página, que
    // é justamente aonde se vai quando as coisas já estão estranhas.
    renderStats().catch(() => null),
  ]);

  return {
    app: {
      health: "ok",
      summary: `LatexBookBank ${process.env["npm_package_version"] ?? "0.0.0"}`,
      details: [
        { label: "Node/Bun", value: process.version },
        { label: "Ambiente", value: process.env["NODE_ENV"] ?? "development" },
        ...hostTexDetails(hostTex),
      ],
    },

    database: {
      health: "ok",
      summary: describeDatabase(env.databaseUrl),
      details: [{ label: "DATABASE_URL", value: redactUrl(env.databaseUrl) }],
    },

    storage: {
      health: "ok",
      summary: `Arquivos locais em ${env.storageRoot}`,
      details: [{ label: "Provider", value: "LocalFileStorageProvider" }],
    },

    renderer,
    renderCache: describeRenderCache(stats),
    ai: describeAi(env.aiBaseUrl, env.aiModel, env.aiApiKey !== null),
    backup,
  };
}

/**
 * O TeX da máquina, dito como o que é.
 *
 * "fallback opcional" está no texto e não só na ausência de alerta: quem lê "pdflatex 2023" numa
 * página de diagnóstico conclui que é ele quem compila, e vai depurar a versão errada quando o
 * PDF sair diferente. Quem compila é a imagem, que traz TeX Live 2022.
 */
function hostTexDetails(tex: HostTex): { label: string; value: string }[] {
  const describe = (found: string | null): string =>
    found === null
      ? "ausente — fallback opcional, não bloqueia"
      : `${found} — fallback opcional; quem compila é o worker`;

  return [
    { label: "pdflatex (host)", value: describe(tex.pdflatex) },
    { label: "pdftocairo (host)", value: describe(tex.pdftocairo) },
  ];
}

/**
 * O cache de render.
 *
 * `health` nunca é `off` por haver falha: um job que falhou é **resultado**, não indisponibilidade
 * — o LaTeX de alguém estava quebrado, e isso não é defeito do produto. Pintar de vermelho aqui
 * mandaria procurar problema de infraestrutura onde há erro de documento.
 */
function describeRenderCache(stats: RenderStats | null): SectionStatus {
  if (stats === null) {
    return {
      health: "off",
      summary: "Não foi possível ler o cache de render",
      details: [{ label: "Provável causa", value: "banco indisponível — ver a seção Banco" }],
    };
  }

  return {
    health: "ok",
    summary:
      stats.jobs === 0
        ? "Nada compilado ainda"
        : `${stats.jobs} job(s) · ${formatBytes(stats.cacheBytes)} em ${stats.artifacts} artefato(s)`,
    details: [
      { label: "Jobs", value: `${stats.jobs} (${stats.failed} com falha)` },
      // Derivado é descartável (D29): este número é quanto se recupera apagando, e é a única
      // razão de ele estar na tela.
      { label: "Tamanho do cache", value: `${formatBytes(stats.cacheBytes)} — descartável (D29)` },
      {
        label: "Último erro",
        value:
          stats.lastError === null
            ? "nenhum"
            : `${format(stats.lastError.at)} · ${stats.lastError.message.slice(0, 160)}`,
      },
    ],
  };
}

async function probeRenderer(
  baseUrl: string | null,
  secret: string | null,
): Promise<SectionStatus> {
  if (baseUrl === null || secret === null) {
    return {
      health: "unconfigured",
      summary: "Worker de render não configurado",
      details: [
        { label: "Como configurar", value: "docker compose up -d, e RENDERER_* em .env.local" },
      ],
    };
  }

  try {
    const response = await fetch(`${baseUrl}/health`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!response.ok) {
      return {
        health: "off",
        summary: `Worker respondeu HTTP ${response.status}`,
        details: [{ label: "Endereço", value: baseUrl }],
      };
    }

    const payload = (await response.json()) as Record<string, unknown>;

    return {
      health: "ok",
      summary: "Worker de render no ar",
      details: [
        { label: "Endereço", value: baseUrl },
        ...["rendererVersion", "pdfLatexVersion", "pdfToCairoVersion", "profileCount"].flatMap(
          (key) => (key in payload ? [{ label: key, value: String(payload[key]) }] : []),
        ),
      ],
    };
  } catch {
    // Configurado e fora do ar é diferente de não configurado: aqui a solução é subir o
    // contêiner, não editar variável.
    return {
      health: "off",
      summary: "Worker configurado, mas não respondeu",
      details: [
        { label: "Endereço", value: baseUrl },
        { label: "Provável causa", value: "contêiner parado — `docker compose up -d`" },
      ],
    };
  }
}

function describeAi(baseUrl: string | null, model: string | null, hasKey: boolean): SectionStatus {
  if (baseUrl === null) {
    return {
      health: "unconfigured",
      summary: "Nenhum endpoint de IA configurado",
      details: [{ label: "Como configurar", value: "AI_BASE_URL e AI_MODEL em .env.local" }],
    };
  }

  const profile = profileForBaseUrl(baseUrl);

  return {
    // "ok" aqui é "configurado", não "respondendo": só o botão de testar sabe a segunda coisa, e
    // fazer a página inteira esperar um modelo local carregar seria trocar diagnóstico por espera.
    health: model === null ? "unconfigured" : "ok",
    summary: model === null ? "Endpoint definido, mas sem AI_MODEL" : `${profile.label} · ${model}`,
    details: [
      { label: "Endereço", value: baseUrl },
      // A chave **nunca** aparece — nem truncada. O que a página precisa dizer é se existe.
      { label: "Chave", value: hasKey ? "definida" : "ausente" },
      { label: "Tool calling", value: profile.assumedCapabilities.toolCalling ? "sim" : "não" },
    ],
  };
}

interface BackupStatusFile {
  finishedAt?: string;
  ok?: boolean;
  workspaces?: number;
  totalBytes?: number;
  failures?: { workspaceId: string; message: string }[];
}

/**
 * Lê o estado que o serviço de backup deixou.
 *
 * Um arquivo, e não uma consulta ao serviço: o backup roda fora do app e pode estar parado
 * justamente quando se quer saber dele. O arquivo continua lá — e "o último backup foi há seis
 * dias" é exatamente a informação que importa nessa hora.
 */
async function readBackupStatus(): Promise<SectionStatus> {
  const destination = process.env["BACKUP_DESTINATION"];
  if (!destination) {
    return {
      health: "unconfigured",
      summary: "Backup automático não configurado",
      details: [{ label: "Como configurar", value: "BACKUP_DESTINATION e o serviço de backup" }],
    };
  }

  try {
    const raw = await readFile(join(destination, "backup-status.json"), "utf8");
    const status = JSON.parse(raw) as BackupStatusFile;

    const when = status.finishedAt ? new Date(status.finishedAt) : null;
    const failures = status.failures ?? [];

    return {
      health: status.ok === true ? "ok" : "off",
      summary:
        status.ok === true
          ? `Último backup: ${format(when)} · ${formatBytes(status.totalBytes ?? 0)}`
          : `Último backup falhou — ${format(when)}`,
      details: [
        { label: "Destino", value: destination },
        { label: "Workspaces", value: String(status.workspaces ?? 0) },
        ...failures.map((failure) => ({
          label: `Falha (${failure.workspaceId})`,
          value: failure.message.slice(0, 200),
        })),
      ],
    };
  } catch {
    // Destino configurado e sem arquivo de estado: o serviço nunca rodou. Dizer isso é melhor que
    // "erro ao ler", que mandaria procurar defeito onde há só ausência.
    return {
      health: "off",
      summary: "Backup configurado, mas nunca executado",
      details: [{ label: "Destino", value: destination }],
    };
  }
}

const format = (date: Date | null): string =>
  date === null ? "—" : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const describeDatabase = (url: string): string =>
  url.startsWith("file:") ? `SQLite em ${url.slice("file:".length)}` : "PostgreSQL";

/** Senha em URL de banco não aparece na tela — nem para quem já está logado. */
const redactUrl = (url: string): string => url.replace(/\/\/([^:]+):[^@]+@/, "//$1:•••@");
