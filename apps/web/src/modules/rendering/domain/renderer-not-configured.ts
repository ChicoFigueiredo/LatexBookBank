/**
 * O worker de render não está configurado.
 *
 * Não configurado é diferente de fora do ar (`RendererUnavailableError`): este se resolve editando
 * `.env.local`, e a mensagem diz o quê. Um erro, e não a resposta que cada rota de render montava à
 * mão (ADR 0011): o 503 sai da tabela de `app/api/http.ts`.
 */
export class RendererNotConfiguredError extends Error {
  constructor() {
    super(
      "`RENDERER_BASE_URL` e `RENDERER_SECRET` não estão definidos. " +
        "Suba o worker com `docker compose up -d` e preencha o `.env.local`.",
    );
    this.name = "RendererNotConfiguredError";
  }
}
