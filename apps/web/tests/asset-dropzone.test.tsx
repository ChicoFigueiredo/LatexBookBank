// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AssetDropzone } from "@modules/assets/ui/AssetDropzone";

/**
 * Os três gestos de trazer um arquivo — escolher, arrastar, colar.
 *
 * Testados juntos porque são um componente só, e é justamente essa a afirmação que precisa
 * continuar verdadeira: se algum dia divergirem, os três testes deixam de passar pelo mesmo
 * caminho e alguém percebe.
 */

afterEach(cleanup);

const png = () => new File([new Uint8Array([1, 2, 3])], "questao.png", { type: "image/png" });

describe("os três gestos", () => {
  it("arrastar e soltar entrega o arquivo", () => {
    const onFile = vi.fn();
    render(<AssetDropzone onFile={onFile} />);

    const zone = screen.getByRole("button");
    const file = png();
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });

    expect(onFile).toHaveBeenCalledWith(file);
  });

  it("colar imagem entrega o arquivo, quando a tela escuta", () => {
    // É o gesto de quem está digitalizando prova: recortar da tela e colar, sem passar pelo disco.
    const onFile = vi.fn();
    render(<AssetDropzone onFile={onFile} listenToPaste />);

    const file = png();
    fireEvent.paste(window, {
      clipboardData: { items: [{ type: "image/png", getAsFile: () => file }] },
    });

    expect(onFile).toHaveBeenCalledWith(file);
  });

  it("escolher pelo seletor entrega o arquivo", () => {
    const onFile = vi.fn();
    const { container } = render(<AssetDropzone onFile={onFile} />);

    const input = container.querySelector("input[type=file]") as HTMLInputElement;
    const file = png();
    fireEvent.change(input, { target: { files: [file] } });

    expect(onFile).toHaveBeenCalledWith(file);
  });
});

describe("o que costuma quebrar", () => {
  it("`dragover` é cancelado — senão o navegador abre o arquivo numa aba e o trabalho se perde", () => {
    render(<AssetDropzone onFile={() => {}} />);

    const cancelled = !fireEvent.dragOver(screen.getByRole("button"));

    expect(cancelled).toBe(true);
  });

  it("colar **texto** não é interceptado", () => {
    // Sem isto, uma tela com dropzone deixaria de aceitar LaTeX colado.
    const onFile = vi.fn();
    render(<AssetDropzone onFile={onFile} listenToPaste />);

    const notCancelled = fireEvent.paste(window, {
      clipboardData: { items: [{ type: "text/plain", getAsFile: () => null }] },
    });

    expect(onFile).not.toHaveBeenCalled();
    expect(notCancelled).toBe(true);
  });

  it("sem `listenToPaste`, colar na janela não faz nada", () => {
    // Numa tela com editor, colar pertence ao editor.
    const onFile = vi.fn();
    render(<AssetDropzone onFile={onFile} />);

    fireEvent.paste(window, {
      clipboardData: { items: [{ type: "image/png", getAsFile: () => png() }] },
    });

    expect(onFile).not.toHaveBeenCalled();
  });

  it("o mesmo arquivo pode ser escolhido duas vezes seguidas", () => {
    // O `input` guarda o valor anterior: sem zerá-lo, o segundo `change` nunca dispara e a tela
    // parece travada justo quando a pessoa repete o gesto porque achou que falhou.
    const onFile = vi.fn();
    const { container } = render(<AssetDropzone onFile={onFile} />);

    const input = container.querySelector("input[type=file]") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [png()] } });

    expect(input.value).toBe("");
  });

  it("desabilitado, nenhum dos gestos entrega nada", () => {
    const onFile = vi.fn();
    render(<AssetDropzone onFile={onFile} disabled listenToPaste />);

    const zone = screen.getByRole("button");
    fireEvent.drop(zone, { dataTransfer: { files: [png()] } });
    fireEvent.paste(window, {
      clipboardData: { items: [{ type: "image/png", getAsFile: () => png() }] },
    });

    expect(onFile).not.toHaveBeenCalled();
  });

  it("`Enter` e espaço abrem o seletor — o teclado alcança o mesmo botão", () => {
    const { container } = render(<AssetDropzone onFile={() => {}} />);

    const input = container.querySelector("input[type=file]") as HTMLInputElement;
    const clicked = vi.spyOn(input, "click");

    fireEvent.keyDown(screen.getByRole("button"), { key: "Enter" });
    fireEvent.keyDown(screen.getByRole("button"), { key: " " });

    expect(clicked).toHaveBeenCalledTimes(2);
  });
});
