// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HistoryPanel, type RevisionRow } from "@modules/questions/ui/HistoryPanel";
import type { RevisionChange } from "@modules/questions/domain/revision-diff";

afterEach(cleanup);

const revisions: RevisionRow[] = [
  {
    revisionNumber: 2,
    origin: "USER",
    summary: "Reverte para a revisão 1.",
    createdAt: "2026-08-10T02:10:00.000Z",
  },
  {
    revisionNumber: 1,
    origin: "AGENT",
    summary: "Corrige a crase no enunciado.",
    createdAt: "2026-08-10T02:00:00.000Z",
  },
];

const changes: RevisionChange[] = [
  {
    id: "field:statementLatex",
    label: "Enunciado",
    before: "Qual e a taxa?",
    after: "Qual é a taxa?",
    latex: true,
  },
];

const show = (over: Partial<Parameters<typeof HistoryPanel>[0]> = {}) =>
  render(
    <HistoryPanel
      revisions={revisions}
      changes={null}
      selected={null}
      onSelect={() => {}}
      onRestore={() => {}}
      {...over}
    />,
  );

describe("a timeline", () => {
  it("cada linha diz **quem** mudou", () => {
    // "O agente mudou o gabarito às 3h" e "eu mudei o gabarito às 3h" pedem reações opostas, e sem
    // a origem as duas linhas são idênticas.
    show();

    expect(screen.getByText("agente")).toBeTruthy();
    expect(screen.getByText("você")).toBeTruthy();
  });

  it("o nome acessível permite escolher numa lista longa", () => {
    show();
    expect(
      screen.getByRole("listitem", {
        name: /Revisão 1, por agente: Corrige a crase no enunciado\./,
      }),
    ).toBeTruthy();
  });

  it("sem histórico, aponta quando a primeira revisão aparece", () => {
    show({ revisions: [] });
    expect(screen.getByText(/depois da primeira edição/)).toBeTruthy();
  });

  it("selecionar uma revisão avisa quem chamou", () => {
    const onSelect = vi.fn();
    show({ onSelect });

    fireEvent.click(screen.getByRole("listitem", { name: /Revisão 2/ }));
    expect(onSelect).toHaveBeenCalledWith(2);
  });
});

describe("o diff", () => {
  it("diz por extenso qual coluna é o passado", () => {
    // Sem isso, qual lado é o passado depende de quem está olhando.
    show({ selected: 1, changes });
    expect(screen.getByText(/À esquerda, como estava nesta revisão/)).toBeTruthy();
  });

  it("mostra antes e depois", () => {
    show({ selected: 1, changes });

    expect(screen.getByText("Qual e a taxa?")).toBeTruthy();
    expect(screen.getByText("Qual é a taxa?")).toBeTruthy();
  });

  it("revisão idêntica ao atual diz isso, e restaurar fica bloqueado", () => {
    show({ selected: 1, changes: [] });

    expect(screen.getByText(/não mudaria nada/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Restaurar esta revisão" })).toHaveProperty(
      "disabled",
      true,
    );
  });
});

describe("restaurar", () => {
  it("pede confirmação antes", () => {
    // Não porque seja destrutivo — a restauração grava a própria revisão antes —, mas porque a
    // lista é navegável por teclado e um Enter distraído trocaria o conteúdo sem aviso.
    const onRestore = vi.fn();
    show({ selected: 1, changes, onRestore });

    fireEvent.click(screen.getByRole("button", { name: "Restaurar esta revisão" }));
    expect(onRestore).not.toHaveBeenCalled();
    expect(screen.getByText(/Voltar ao estado da revisão 1\?/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Restaurar" }));
    expect(onRestore).toHaveBeenCalledWith(1);
  });

  it("cancelar volta ao estado anterior sem restaurar", () => {
    const onRestore = vi.fn();
    show({ selected: 1, changes, onRestore });

    fireEvent.click(screen.getByRole("button", { name: "Restaurar esta revisão" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onRestore).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Restaurar esta revisão" })).toBeTruthy();
  });
});
