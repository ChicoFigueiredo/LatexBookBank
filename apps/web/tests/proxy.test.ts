import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy } from "../proxy";

/**
 * O perímetro do app (#242, SEC-01 da revisão de 2026-09-23).
 *
 * A API não tem autenticação: quem alcança a porta lê e apaga o acervo. Escutar só em
 * `127.0.0.1` tira a rede local do caminho, mas não o navegador da própria pessoa — uma página
 * qualquer ainda fala com `localhost` por DNS rebinding (o `Host` é o domínio do atacante) ou por
 * CSRF (o `Origin` é o do atacante). É isso que o proxy recusa, antes de qualquer rota.
 */

const request = (url: string, init: { method?: string; headers?: Record<string, string> } = {}) =>
  new NextRequest(url, { method: init.method ?? "GET", headers: init.headers ?? {} });

const passes = (response: Response) => response.headers.get("x-middleware-next") === "1";

describe("proxy", () => {
  it("recusa um Host que não é desta máquina — o DNS rebinding", () => {
    const response = proxy(
      request("http://evil.example:28080/api/libraries", {
        headers: { host: "evil.example:28080" },
      }),
    );

    expect(response.status).toBe(403);
  });

  it("deixa passar quem fala com esta máquina pelo nome dela", () => {
    for (const host of ["localhost:28080", "127.0.0.1:28080", "[::1]:28080"]) {
      expect(
        passes(proxy(request(`http://${host}/api/libraries`, { headers: { host } }))),
        host,
      ).toBe(true);
    }
  });

  it("recusa a escrita que vem de outro site — o CSRF", () => {
    const response = proxy(
      request("http://localhost:28080/api/trash", {
        method: "DELETE",
        headers: { host: "localhost:28080", origin: "https://evil.example" },
      }),
    );

    expect(response.status).toBe(403);
  });

  it("aceita a escrita da própria tela, e a de quem não é navegador", () => {
    const daTela = request("http://localhost:28080/api/trash", {
      method: "DELETE",
      headers: { host: "localhost:28080", origin: "http://localhost:28080" },
    });
    const doCurl = request("http://127.0.0.1:28080/api/trash", {
      method: "DELETE",
      headers: { host: "127.0.0.1:28080" },
    });

    expect(passes(proxy(daTela))).toBe(true);
    expect(passes(proxy(doCurl))).toBe(true);
  });

  it("outra porta da mesma máquina é outra origem — outro app local não escreve aqui", () => {
    const response = proxy(
      request("http://localhost:28080/api/workspaces/import", {
        method: "POST",
        headers: { host: "localhost:28080", origin: "http://localhost:3000" },
      }),
    );

    expect(response.status).toBe(403);
  });

  it("um link de outro site continua abrindo a página", () => {
    const navegacao = request("http://localhost:28080/bibliotecas", {
      headers: {
        host: "localhost:28080",
        origin: "https://evil.example",
        "sec-fetch-site": "cross-site",
      },
    });

    expect(passes(proxy(navegacao))).toBe(true);
  });
});
