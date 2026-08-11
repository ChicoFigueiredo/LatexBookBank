// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  attach,
  EMPTY_CONTEXT,
  type AgentContext,
  type ContextItem,
} from "@modules/agents/domain/agent-context";
import { AgentPanel } from "@modules/agents/ui/AgentPanel";

afterEach(cleanup);

const item = (over: Partial<ContextItem> = {}): ContextItem => ({
  id: "q-1",
  kind: "question",
  label: "Questão 1",
  content: "Enunciado",
  explicit: true,
  ...over,
});

const contextWith = (...items: ContextItem[]): AgentContext => items.reduce(attach, EMPTY_CONTEXT);

const show = (over: Partial<Parameters<typeof AgentPanel>[0]> = {}) =>
  render(
    <AgentPanel
      context={EMPTY_CONTEXT}
      onDetach={() => {}}
      model="qwen3-coder:30b"
      providerLabel="Ollama local"
      {...over}
    />,
  );

describe("o que o agente vê está à vista", () => {
  it("sem contexto, diz a regra em vez de acusar falta", () => {
    show();
    expect(screen.getByText(/só vê o que você anexar/)).toBeTruthy();
  });

  it("cada item é um chip com remoção própria", () => {
    // "Remover" sozinho não diz o quê, e há vários na barra.
    const onDetach = vi.fn();
    show({
      context: contextWith(item(), item({ id: "m", kind: "metadata", label: "Metadados" })),
      onDetach,
    });

    fireEvent.click(screen.getByRole("button", { name: "Remover Questão 1 do contexto" }));
    expect(onDetach).toHaveBeenCalledWith("q-1");
  });

  it("mostra quanto do teto já foi usado", () => {
    // O custo de uma pergunta é o contexto, não a pergunta.
    show({ context: contextWith(item({ content: "x".repeat(30_000) })) });
    expect(screen.getByText(/50% de 60k/)).toBeTruthy();
  });

  it("o que foi anexado sozinho fica visivelmente diferente", () => {
    show({ context: contextWith(item({ explicit: false })) });
    const chip = screen.getByText("Questão 1").closest("span");

    expect(chip?.className).toContain("lbb-ctxbar-implicit");
  });

  it("limpar só aparece quando há o que limpar", () => {
    const onClear = vi.fn();
    const { rerender } = show({ onClear });
    expect(screen.queryByRole("button", { name: "Limpar" })).toBeNull();

    rerender(
      <AgentPanel
        context={contextWith(item())}
        onDetach={() => {}}
        onClear={onClear}
        model="m"
        providerLabel="Ollama local"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Limpar" }));
    expect(onClear).toHaveBeenCalled();
  });
});

describe("de onde vem a resposta", () => {
  it("provider e modelo ficam à vista", () => {
    // Sem isso não dá para saber se a resposta veio do modelo local ou de um endpoint pago.
    show();
    expect(screen.getByText("Ollama local")).toBeTruthy();
    expect(screen.getByText("qwen3-coder:30b")).toBeTruthy();
  });

  it("sem IA configurada, o painel diz o que falta em vez de sumir", () => {
    show({ model: null, providerLabel: null });

    expect(screen.getByText(/AI_BASE_URL/)).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Pergunta ao agente" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("declara que é somente leitura", () => {
    // O agente propõe; quem escreve é o usuário. A garantia é de arquitetura — nenhuma tool de
    // escrita existe —, mas o usuário precisa saber disso sem ler o código.
    show();
    expect(screen.getByText("somente leitura")).toBeTruthy();
  });
});

describe("perguntar", () => {
  it("`Ctrl+Enter` envia — `Enter` não", () => {
    // A pergunta costuma ter mais de uma linha, e enviar na primeira quebra seria enviar meia
    // pergunta. Mesmo gesto do render (Fase 6).
    const onSend = vi.fn();
    show({ onSend });
    const input = screen.getByRole("textbox", { name: "Pergunta ao agente" });

    fireEvent.change(input, { target: { value: "Esta questão está correta?" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
    expect(onSend).toHaveBeenCalledWith("Esta questão está correta?");
  });

  it("o campo esvazia depois de enviar", () => {
    show({ onSend: vi.fn() });
    const input = screen.getByRole("textbox", {
      name: "Pergunta ao agente",
    }) as HTMLTextAreaElement;

    fireEvent.change(input, { target: { value: "oi" } });
    fireEvent.click(screen.getByRole("button", { name: "Perguntar ao agente" }));
    expect(input.value).toBe("");
  });

  it("pergunta em branco não vira requisição", () => {
    const onSend = vi.fn();
    show({ onSend });
    const input = screen.getByRole("textbox", { name: "Pergunta ao agente" });

    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("enquanto responde, não aceita outra", () => {
    const onSend = vi.fn();
    show({ onSend, busy: true, turns: [{ id: "1", role: "user", text: "oi" }] });

    expect(screen.getByRole("textbox", { name: "Pergunta ao agente" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("mostra o que o agente leu, antes do que ele disse", () => {
    // Sem a timeline, a resposta é uma afirmação sem procedência — e ler a procedência depois já
    // é ter acreditado.
    show({
      turns: [
        {
          id: "2",
          role: "assistant",
          text: "A alternativa correta é a segunda.",
          toolCalls: [
            {
              name: "get_current_question",
              inputSummary: "questionId=q-1",
              outputChars: 412,
              durationMs: 7,
              status: "ok",
            },
          ],
        },
      ],
    });

    expect(screen.getByLabelText("Ferramenta get_current_question, concluída")).toBeTruthy();
    expect(screen.getByText("questionId=q-1")).toBeTruthy();
    expect(screen.getByText(/412 car · 7 ms/)).toBeTruthy();
  });

  it("tool com erro é distinguível sem depender da cor", () => {
    // Leitor de tela não enxerga a borda vermelha, e "chamou" e "falhou" são coisas diferentes.
    show({
      turns: [
        {
          id: "2",
          role: "assistant",
          text: "Preciso do id.",
          toolCalls: [
            {
              name: "get_current_question",
              inputSummary: "questionId=",
              outputChars: 40,
              durationMs: 1,
              status: "error",
              error: "`questionId` é obrigatório.",
            },
          ],
        },
      ],
    });

    expect(screen.getByLabelText("Ferramenta get_current_question, com erro")).toBeTruthy();
    // Com erro, o card mostra o motivo em vez do input — é o que o usuário precisa ler.
    expect(screen.getByText("`questionId` é obrigatório.")).toBeTruthy();
  });

  it("tokens aparecem quando o provider informa", () => {
    show({
      turns: [
        {
          id: "2",
          role: "assistant",
          text: "ok",
          usage: { inputTokens: 412, outputTokens: 37 },
        },
      ],
    });

    expect(screen.getByText("412 entrada · 37 saída")).toBeTruthy();
  });

  it("sem uso informado, nada é exibido — nem zero", () => {
    // Zero token seria uma afirmação falsa sobre o custo.
    show({ turns: [{ id: "2", role: "assistant", text: "ok" }] });
    expect(screen.queryByText(/entrada ·/)).toBeNull();
  });

  it("mostra quem disse o quê", () => {
    show({
      turns: [
        { id: "1", role: "user", text: "Esta questão está correta?" },
        { id: "2", role: "assistant", text: "O gabarito aponta a alternativa C." },
      ],
    });

    expect(screen.getByText("Você")).toBeTruthy();
    expect(screen.getByText("Agente")).toBeTruthy();
    expect(screen.getByText("O gabarito aponta a alternativa C.")).toBeTruthy();
  });
});
