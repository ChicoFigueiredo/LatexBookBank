import type { HTMLAttributes, ReactNode } from "react";

import { Icon, type IconName } from "../Icon";
import { injectCss } from "../shared/inject-css";

const CSS = `
.lbb-status{display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 9px;border-radius:var(--radius-pill);border:1px solid;font-size:var(--text-body-sm);font-weight:var(--weight-medium);white-space:nowrap}
.lbb-status[data-mono="true"]{font-family:var(--font-mono);font-size:var(--text-meta)}
.lbb-status[data-emphasis="true"]{border-width:1.5px}
.lbb-status[data-size="sm"]{height:18px;padding:0 7px;font-size:var(--text-meta);gap:5px}
@media (prefers-reduced-motion: reduce){.lbb-status .lbb-spin{animation:none !important}}
`;

/**
 * Ontologia de estados do LatexBookBank.
 *
 * Cada estado é **cor + ícone + rótulo**, nunca só cor — quem não distingue a cor precisa ler o
 * estado, e a árvore exibe dezenas deles de relance.
 *
 * Os namespaces não se misturam: ciclo de vida e validação usam `status.*`; tudo que vem do
 * agente usa `ai.*`. Uma proposta do agente nunca deve ler como um estado do produto.
 *
 * **A regra dura deste domínio:** `agent_proposed` **não é** `agent_applied`. No EduLingo o
 * análogo era `generated_flow ≠ flow`. Aqui, um patch proposto que pareça aplicado convida
 * exatamente o erro que a spec §14 proíbe — alteração agêntica sem aprovação explícita. Por isso
 * `agent_proposed` tem ênfase de borda e o rótulo diz o que falta, não o que aconteceu.
 */

interface StateStyle {
  readonly group: string;
  readonly label: string;
  readonly icon: IconName;
  readonly fg: string;
  readonly bg: string;
  readonly bd: string;
  readonly mono?: boolean;
  readonly emphasis?: boolean;
  readonly spin?: boolean;
}

export const ARTIFACT_STATES = {
  // ── Ciclo de vida da questão ──────────────────────────────────────
  draft: {
    group: "questão",
    label: "Rascunho",
    icon: "pencil",
    fg: "var(--text-secondary)",
    bg: "var(--surface-sunken)",
    bd: "var(--border-default)",
  },
  ready: {
    group: "questão",
    label: "Pronta",
    icon: "circle-check",
    fg: "var(--ok-text)",
    bg: "var(--ok-surface)",
    bd: "var(--ok-border)",
  },
  archived: {
    group: "questão",
    label: "Arquivada",
    icon: "archive",
    fg: "var(--text-muted)",
    bg: "var(--surface-sunken)",
    bd: "var(--border-subtle)",
  },

  // ── Validação ─────────────────────────────────────────────────────
  unvalidated: {
    group: "validação",
    label: "Não validada",
    icon: "circle-help",
    fg: "var(--text-secondary)",
    bg: "var(--surface-sunken)",
    bd: "var(--border-default)",
  },
  valid: {
    group: "validação",
    label: "Validada",
    icon: "circle-check",
    fg: "var(--ok-text)",
    bg: "var(--ok-surface)",
    bd: "var(--ok-border)",
  },
  invalid: {
    // Gabarito ausente ou duplicado, alternativa vazia. Precisa gritar: é conteúdo que parece
    // pronto e não está.
    group: "validação",
    label: "Inconsistente",
    icon: "triangle-alert",
    emphasis: true,
    fg: "var(--danger-text)",
    bg: "var(--danger-surface)",
    bd: "var(--danger)",
  },

  // ── Render (mapeia RenderJob.status, Fase 6) ──────────────────────
  render_queued: {
    group: "render",
    label: "Na fila",
    icon: "clock",
    fg: "var(--text-secondary)",
    bg: "var(--surface-sunken)",
    bd: "var(--border-default)",
  },
  render_running: {
    group: "render",
    label: "Compilando…",
    icon: "loader",
    spin: true,
    fg: "var(--info-text)",
    bg: "var(--info-surface)",
    bd: "var(--info-border)",
  },
  render_done: {
    group: "render",
    label: "Renderizada",
    icon: "circle-check",
    fg: "var(--ok-text)",
    bg: "var(--ok-surface)",
    bd: "var(--ok-border)",
  },
  render_cached: {
    // Distinto de `render_done` porque a spec §12.2 pede `cacheHit` visível: saber que o
    // artefato veio do cache é o que explica um resultado instantâneo — e o que denuncia um
    // cache que deveria ter sido invalidado.
    group: "render",
    label: "Do cache",
    icon: "history",
    mono: true,
    fg: "var(--text-secondary)",
    bg: "var(--surface-sunken)",
    bd: "var(--border-default)",
  },
  render_failed: {
    group: "render",
    label: "Erro de compilação",
    icon: "triangle-alert",
    fg: "var(--danger-text)",
    bg: "var(--danger-surface)",
    bd: "var(--danger-border)",
  },

  // ── Agente (ai.* — lilás exclusivo; erro é danger) ────────────────
  agent_running: {
    group: "agente",
    label: "Agente analisando…",
    icon: "loader",
    spin: true,
    fg: "var(--ai-text)",
    bg: "var(--ai-surface)",
    bd: "var(--ai-border)",
  },
  agent_proposed: {
    // A regra dura. O rótulo diz o que **falta**, não o que aconteceu.
    group: "agente",
    label: "Patch proposto · aguarda aprovação",
    icon: "sparkles",
    emphasis: true,
    fg: "var(--ai-text)",
    bg: "var(--ai-surface)",
    bd: "var(--ai)",
  },
  agent_applied: {
    group: "agente",
    label: "Patch aplicado",
    icon: "circle-check",
    fg: "var(--ok-text)",
    bg: "var(--ok-surface)",
    bd: "var(--ok-border)",
  },
  agent_rejected: {
    group: "agente",
    label: "Patch rejeitado",
    icon: "circle-x",
    fg: "var(--text-muted)",
    bg: "var(--surface-sunken)",
    bd: "var(--border-subtle)",
  },
  agent_error: {
    group: "agente",
    label: "Erro do provider",
    icon: "circle-alert",
    fg: "var(--danger-text)",
    bg: "var(--danger-surface)",
    bd: "var(--danger-border)",
  },

  // ── Importação (Fase 11) ──────────────────────────────────────────
  import_running: {
    group: "importação",
    label: "Importando…",
    icon: "loader",
    spin: true,
    fg: "var(--info-text)",
    bg: "var(--info-surface)",
    bd: "var(--info-border)",
  },
  import_done: {
    group: "importação",
    label: "Importado",
    icon: "circle-check",
    fg: "var(--ok-text)",
    bg: "var(--ok-surface)",
    bd: "var(--ok-border)",
  },
  import_failed: {
    group: "importação",
    label: "Falha na importação",
    icon: "triangle-alert",
    fg: "var(--danger-text)",
    bg: "var(--danger-surface)",
    bd: "var(--danger-border)",
  },
} as const satisfies Record<string, StateStyle>;

export type ArtifactStatusId = keyof typeof ARTIFACT_STATES;

export interface ArtifactStatusProps extends HTMLAttributes<HTMLSpanElement> {
  readonly status: ArtifactStatusId;
  /** Sobrescreve o rótulo. Ícone e cor permanecem — a semântica é do estado, não do texto. */
  readonly label?: ReactNode;
  readonly size?: "sm" | "md";
}

export function ArtifactStatus({
  status,
  label,
  size = "md",
  style,
  ...rest
}: ArtifactStatusProps) {
  injectCss("lbb-status-css", CSS);
  const state: StateStyle = ARTIFACT_STATES[status];

  return (
    <span
      className="lbb-status"
      data-mono={state.mono ? "true" : "false"}
      data-emphasis={state.emphasis ? "true" : "false"}
      data-size={size}
      data-status={status}
      style={{ color: state.fg, background: state.bg, borderColor: state.bd, ...style }}
      {...rest}
    >
      <Icon
        name={state.icon}
        size={size === "sm" ? 11 : 13}
        // Spread condicional: com `exactOptionalPropertyTypes`, passar `undefined` explícito a
        // uma prop opcional é erro — e é um rigor que vale, porque "ausente" e "undefined"
        // deixam de ser a mesma coisa por acidente.
        {...(state.spin
          ? { className: "lbb-spin", style: { animation: "lbb-spin .9s linear infinite" } }
          : {})}
      />
      {label ?? state.label}
    </span>
  );
}

/**
 * Um patch só pode ser aplicado a partir de `agent_proposed`, e só com aprovação explícita.
 *
 * Existe como função, e não como checagem espalhada, porque é a regra que a spec §14.6 e §24
 * mais protegem: nada do agente entra no banco sem alguém dizer sim. Um `if` solto numa página
 * é fácil de esquecer no próximo botão.
 */
export const canApplyPatch = (args: {
  readonly status: ArtifactStatusId;
  readonly approvedByUser: boolean;
}): boolean => args.status === "agent_proposed" && args.approvedByUser;
