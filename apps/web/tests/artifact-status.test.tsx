// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ARTIFACT_STATES, ArtifactStatus, canApplyPatch } from "@/design-system";

/**
 * A ontologia de estados carrega regra de produto, não só estilo. O que se testa aqui é
 * justamente a parte que uma mudança de aparência poderia apagar sem querer.
 */

describe("nenhum estado depende só de cor", () => {
  it("todo estado tem rótulo e ícone", () => {
    for (const [id, state] of Object.entries(ARTIFACT_STATES)) {
      expect(state.label, `${id} sem rótulo`).toBeTruthy();
      expect(state.icon, `${id} sem ícone`).toBeTruthy();
    }
  });

  it("o rótulo chega ao DOM", () => {
    render(<ArtifactStatus status="render_failed" />);
    expect(screen.getByText("Erro de compilação")).toBeDefined();
  });
});

describe("proposto ≠ aplicado — a regra dura", () => {
  it("o rótulo de `agent_proposed` diz o que falta, não o que aconteceu", () => {
    // Um patch proposto que leia como aplicado convida a alteração sem aprovação (spec §14).
    expect(ARTIFACT_STATES.agent_proposed.label).toContain("aguarda aprovação");
    expect(ARTIFACT_STATES.agent_proposed.emphasis).toBe(true);
  });

  it("`agent_proposed` e `agent_applied` não compartilham cor", () => {
    expect(ARTIFACT_STATES.agent_proposed.fg).not.toBe(ARTIFACT_STATES.agent_applied.fg);
  });

  it("patch só pode ser aplicado de `agent_proposed` e com aprovação explícita", () => {
    expect(canApplyPatch({ status: "agent_proposed", approvedByUser: true })).toBe(true);
    // Sem aprovação, não.
    expect(canApplyPatch({ status: "agent_proposed", approvedByUser: false })).toBe(false);
    // Já aplicado, não de novo.
    expect(canApplyPatch({ status: "agent_applied", approvedByUser: true })).toBe(false);
    // Rejeitado não volta atrás sozinho.
    expect(canApplyPatch({ status: "agent_rejected", approvedByUser: true })).toBe(false);
  });
});

describe("namespaces não se misturam", () => {
  it("estados do agente usam `--ai`, nunca cor de status", () => {
    for (const id of ["agent_running", "agent_proposed"] as const) {
      expect(ARTIFACT_STATES[id].fg).toContain("--ai");
    }
  });

  it("erro do agente é `danger`, porque falha é falha", () => {
    // Exceção deliberada: o lilás sinaliza origem, mas um erro precisa ler como erro.
    expect(ARTIFACT_STATES.agent_error.fg).toContain("--danger");
  });
});

describe("render do cache é distinguível", () => {
  it("`render_cached` não se confunde com `render_done`", () => {
    // A spec §12.2 pede `cacheHit` visível: é o que explica resposta instantânea — e o que
    // denuncia um cache que deveria ter sido invalidado.
    expect(ARTIFACT_STATES.render_cached.label).not.toBe(ARTIFACT_STATES.render_done.label);
    expect(ARTIFACT_STATES.render_cached.mono).toBe(true);
  });
});

describe("estados que giram respeitam prefers-reduced-motion", () => {
  it("aplica a classe que o CSS neutraliza", () => {
    const { container } = render(<ArtifactStatus status="render_running" />);
    expect(container.querySelector(".lbb-spin")).not.toBeNull();
  });
});
