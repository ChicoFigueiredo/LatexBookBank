// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { QuestionMetadata } from "@modules/questions/domain/question-metadata";
import { MetadataPanel } from "@modules/questions/ui/MetadataPanel";

afterEach(cleanup);

const metadata = (over: Partial<QuestionMetadata> = {}): QuestionMetadata => ({
  difficulty: 5,
  year: null,
  board: null,
  institution: null,
  role: null,
  roleLevel: null,
  publisher: null,
  videoUrl: null,
  ...over,
});

const show = (over: Partial<Parameters<typeof MetadataPanel>[0]> = {}) =>
  render(<MetadataPanel metadata={metadata()} onChange={() => {}} {...over} />);

describe("MetadataPanel", () => {
  it("oferece a escala legada, com os rótulos do acervo", () => {
    // 0 · 2 · 5 · 7 · 10, e **não** 1–5.
    show();
    const select = screen.getByRole("combobox", { name: "Dificuldade" }) as HTMLSelectElement;

    expect([...select.options].map((o) => o.value)).toEqual(["0", "2", "5", "7", "10"]);
    expect(screen.getByRole("option", { name: "Muito Fácil" })).toBeTruthy();
  });

  it("o campo de vídeo **aceita digitação**", () => {
    // A primeira versão tinha `value` controlado com um `onChange` que não atualizava nada — quer
    // dizer, um campo onde não dava para digitar.
    show();
    const input = screen.getByRole("textbox", { name: "Vídeo" }) as HTMLInputElement;

    fireEvent.change(input, { target: { value: "https://youtu.be/x" } });
    expect(input.value).toBe("https://youtu.be/x");
  });

  it("só valida a URL ao sair do campo", () => {
    // Validar a cada tecla acusaria erro em `h`, `ht`, `htt` — o tempo todo enquanto se digita.
    const onChange = vi.fn();
    show({ onChange });
    const input = screen.getByRole("textbox", { name: "Vídeo" });

    fireEvent.change(input, { target: { value: "htt" } });
    expect(screen.queryByText(/Valor recusado/)).toBeNull();

    fireEvent.blur(input, { target: { value: "htt" } });
    expect(screen.getByText(/Valor recusado/)).toBeTruthy();
  });

  it("recusa `javascript:` e mostra por quê", () => {
    show();
    const input = screen.getByRole("textbox", { name: "Vídeo" });
    fireEvent.blur(input, { target: { value: "javascript:alert(1)" } });

    expect(screen.getByText(/http/)).toBeTruthy();
  });

  it("valor recusado **não** vira mudança", () => {
    // Senão a tela mostraria um estado que o banco não tem.
    const onChange = vi.fn();
    show({ onChange });

    fireEvent.change(screen.getByRole("spinbutton", { name: "Ano" }), {
      target: { value: "20244" },
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/Valor recusado/)).toBeTruthy();
  });

  it("valor válido sobe normalizado", () => {
    const onChange = vi.fn();
    show({ onChange });

    fireEvent.change(screen.getByRole("textbox", { name: "Banca" }), {
      target: { value: "  CESPE / CEBRASPE " },
    });
    expect(onChange).toHaveBeenCalledWith({ board: "CESPE / CEBRASPE" });
  });

  it("avisa sobre ano sem banca — sem impedir nada", () => {
    show({ metadata: metadata({ year: 2024 }) });

    expect(screen.getByText("Metadado incompleto")).toBeTruthy();
    expect(screen.queryByText("Valor recusado")).toBeNull();
  });

  it("questão de livro não gera aviso", () => {
    // Metade do acervo é assim: sem banca e sem ano. Avisar seria ruído.
    show();
    expect(screen.queryByText("Metadado incompleto")).toBeNull();
  });

  it("desabilitado bloqueia os campos", () => {
    show({ disabled: true });

    expect(screen.getByRole("textbox", { name: "Banca" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("combobox", { name: "Dificuldade" })).toHaveProperty("disabled", true);
  });
});
