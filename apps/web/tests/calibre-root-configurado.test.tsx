// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CalibreScreen } from "../app/bibliotecas/[slug]/livros/calibre/calibre-screen";
import { __resetStoredStateCache } from "../src/design-system/shared/use-stored-state";

/**
 * A pasta do Calibre configurada no ambiente (`CALIBRE_LIBRARY_ROOT`).
 *
 * O caminho é preferência de máquina e vive no `localStorage` (§65) — o que é certo, e tem um
 * custo: quando a biblioteca muda de lugar, o navegador continua guardando um caminho que não
 * abre mais. Foi o que aconteceu duas vezes nesta máquina: o acervo legado saiu de `/mnt/t` para
 * `/mnt/bak` na reinstalação, e o Calibre foi para `/mnt/e/Livros`.
 *
 * O ambiente passa a dizer onde a biblioteca está. O que ele **não** faz é mandar: um caminho já
 * escolhido continua ganhando, porque a pessoa pode ter mais de uma biblioteca e o app não sabe
 * qual ela quer hoje. O que ele oferece é um ponto de partida e um caminho de volta.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/bibliotecas/matematica/livros/calibre",
}));

const LIBRARY = { id: "lib1", name: "Matemática", slug: "matematica" };
const CONFIGURADA = "/mnt/e/Livros";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  __resetStoredStateCache();
});

const campo = () => screen.getByPlaceholderText(CONFIGURADA) as HTMLInputElement;

describe("pasta do Calibre configurada no ambiente", () => {
  it("uma instalação nova começa com a pasta configurada, não com o campo vazio", () => {
    render(<CalibreScreen library={LIBRARY} configuredRoot={CONFIGURADA} />);

    expect(campo().value).toBe(CONFIGURADA);
    // Com o campo já preenchido, "Abrir catálogo" nasce clicável: sem isto, a primeira
    // importação de quem acabou de clonar o repositório começa por digitar um caminho.
    const abrir = screen.getByRole("button", { name: "Abrir catálogo" }) as HTMLButtonElement;
    expect(abrir.disabled).toBe(false);
  });

  it("o caminho já escolhido ganha da configuração — e volta com um clique", () => {
    window.localStorage.setItem("lbb:calibre:root", JSON.stringify("/mnt/u/Calibre"));

    render(<CalibreScreen library={LIBRARY} configuredRoot={CONFIGURADA} />);

    // O guardado manda: o app não sabe se a pessoa tem outra biblioteca.
    expect(campo().value).toBe("/mnt/u/Calibre");

    // Mas o caminho de volta está à vista, e é isso que conserta a biblioteca que mudou de lugar.
    fireEvent.click(screen.getByRole("button", { name: "Usar a biblioteca configurada" }));
    expect(campo().value).toBe(CONFIGURADA);
  });

  it("com a pasta configurada em uso, não há botão para repropô-la", () => {
    render(<CalibreScreen library={LIBRARY} configuredRoot={CONFIGURADA} />);

    expect(screen.queryByRole("button", { name: "Usar a biblioteca configurada" })).toBeNull();
  });

  it("sem configuração no ambiente, a tela não promete uma pasta que não existe", () => {
    render(<CalibreScreen library={LIBRARY} configuredRoot={null} />);

    expect(screen.queryByRole("button", { name: "Usar a biblioteca configurada" })).toBeNull();
    expect(screen.queryByText(/A configurada nesta máquina é/)).toBeNull();
    expect(
      (screen.getByPlaceholderText("/caminho/para/Calibre") as HTMLInputElement).value,
    ).toBe("");
  });
});
