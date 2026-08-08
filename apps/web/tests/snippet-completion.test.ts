import { describe, expect, it } from "vitest";

import type { LatexSnippet } from "@modules/latex-knowledge/domain/latex-knowledge";
import {
  toCompletionCandidate,
  withSelectionInFirstPlaceholder,
} from "@modules/latex-knowledge/domain/snippet-completion";
import { toMonacoSnippet } from "@modules/latex-knowledge/domain/monaco-snippet";

const snippet = (over: Partial<LatexSnippet> = {}): LatexSnippet => ({
  trigger: "alpha",
  label: "\\alpha",
  body: "\\\\alpha",
  documentation: null,
  priority: 0,
  hasPlaceholders: false,
  legacyId: 1,
  ...over,
});

describe("toCompletionCandidate", () => {
  it("mostra o rótulo com a barra — quem digita `\\` espera ver `\\alpha`", () => {
    expect(toCompletionCandidate(snippet()).label).toBe("\\alpha");
  });

  it("filtra pela palavra sem a barra — é o que o Monaco compara com o digitado", () => {
    expect(toCompletionCandidate(snippet()).filterText).toBe("alpha");
  });

  it("ordena por prioridade decrescente, apesar de o Monaco ordenar crescente", () => {
    const alta = toCompletionCandidate(snippet({ trigger: "addto", priority: 49 }));
    const baixa = toCompletionCandidate(snippet({ trigger: "addto", priority: 0 }));

    expect(alta.sortText < baixa.sortText).toBe(true);
  });

  it("não deixa a comparação textual inverter a ordem numérica", () => {
    // Sem `padStart`, `"9"` viria depois de `"10"` e a prioridade 9 cairia abaixo da 990.
    const p9 = toCompletionCandidate(snippet({ priority: 9 }));
    const p10 = toCompletionCandidate(snippet({ priority: 10 }));

    expect(p10.sortText < p9.sortText).toBe(true);
  });

  it("omite o detalhe quando ele repetiria o rótulo", () => {
    expect(toCompletionCandidate(snippet()).detail).toBeNull();
  });

  it("mostra o detalhe quando ele diz algo a mais", () => {
    const candidate = toCompletionCandidate(
      snippet({ trigger: "frac", label: "\\frac{num}{den}" }),
    );
    expect(candidate.detail).toBe("\\frac{num}{den}");
  });

  it("marca como snippet só o que tem ponto de parada", () => {
    expect(toCompletionCandidate(snippet()).isSnippet).toBe(false);
    expect(toCompletionCandidate(snippet({ hasPlaceholders: true })).isSnippet).toBe(true);
  });

  it("preserva o corpo escapado — é o parser de snippet que desfaz o escape", () => {
    // Se o consumidor inserisse isto como texto puro, apareceria `\\alpha` na tela.
    expect(toCompletionCandidate(snippet()).insertText).toBe("\\\\alpha");
  });
});

describe("withSelectionInFirstPlaceholder", () => {
  it("põe a seleção no primeiro ponto de parada, mantendo o padrão como reserva", () => {
    const body = toMonacoSnippet("\\textbf{§und§}");
    const withSelection = withSelectionInFirstPlaceholder(body);

    expect(withSelection).toContain("${1:${TM_SELECTED_TEXT:und}}");
    // Sem seleção, o Monaco cai no padrão original — o comportamento de antes continua.
    expect(withSelection).toContain("und");
  });

  it("não mexe nos pontos de parada seguintes", () => {
    const body = toMonacoSnippet("\\frac{§num§}{§den§}");
    const withSelection = withSelectionInFirstPlaceholder(body);

    expect(withSelection).toContain("${2:den}");
    expect(withSelection).not.toContain("${2:${TM_SELECTED_TEXT");
  });

  it("devolve intacto um corpo sem ponto de parada", () => {
    expect(withSelectionInFirstPlaceholder("\\\\alpha")).toBe("\\\\alpha");
  });

  it("é idempotente — aplicar duas vezes não aninha a variável de novo", () => {
    const once = withSelectionInFirstPlaceholder(toMonacoSnippet("\\textbf{§und§}"));
    expect(withSelectionInFirstPlaceholder(once)).toBe(once);
  });
});
