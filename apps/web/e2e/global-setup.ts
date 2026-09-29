import type { FullConfig } from "@playwright/test";

/**
 * A trava do E2E (#241): nenhum teste roda se o servidor não for o dele.
 *
 * A porta própria e o `reuseExistingServer: false` já garantem isso hoje. Esta trava é para o dia
 * em que alguém mudar a config: um E2E que esvazia a lixeira não pode depender de convenção de
 * porta para não esvaziar a lixeira do acervo.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) throw new Error("E2E sem baseURL: confira o playwright.config.ts");

  const response = await fetch(new URL("/api/infra", baseURL));
  const { instance } = (await response.json()) as { instance?: string };

  if (instance !== "e2e") {
    throw new Error(
      `O E2E recusa rodar contra ${baseURL}: a instância é "${instance ?? "desconhecida"}", e não "e2e". ` +
        "Ele só roda contra o servidor que o e2e/server.ts sobe, com banco e storage descartáveis.",
    );
  }
}
