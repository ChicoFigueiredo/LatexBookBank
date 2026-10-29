import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { config, proxy } from "../proxy";

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

  it("recusa a escrita que o navegador diz ser de outro site, mesmo sem Origin", () => {
    const response = proxy(
      request("http://localhost:28080/api/trash", {
        method: "DELETE",
        headers: { host: "localhost:28080", "sec-fetch-site": "cross-site" },
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

/**
 * A guarda do perímetro: o `matcher` alcança **toda** rota da API. Uma exclusão a mais no padrão —
 * "o `/api/health` não precisa passar pelo proxy" — tiraria a rota do perímetro sem ninguém ver.
 */
describe("o proxy cobre a API inteira", () => {
  const api = fileURLToPath(new URL("../app/api", import.meta.url));

  const routes = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return routes(full);
      return entry.name === "route.ts" ? [path.dirname(full)] : [];
    });

  it("toda rota de app/api casa com o matcher", () => {
    // O matcher é um padrão do path-to-regexp; o deste arquivo é uma regex entre parênteses.
    const covers = config.matcher.map((source) => new RegExp(`^${source}$`));
    const paths = routes(api).map(
      (dir) => `/api/${path.relative(api, dir).replaceAll("[", "x").replaceAll("]", "")}`,
    );

    expect(paths.length).toBeGreaterThan(50);
    for (const url of paths) {
      expect(
        covers.some((pattern) => pattern.test(url)),
        url,
      ).toBe(true);
    }
  });
});
