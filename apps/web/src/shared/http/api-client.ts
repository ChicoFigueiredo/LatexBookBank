/**
 * O lado do navegador das rotas, num lugar só.
 *
 * Cada tela fazia `(await response.json()) as {...}` com a forma da resposta escrita à mão, e o
 * `tsc` não ligava essa forma à rota: renomear um campo no servidor passava limpo e a tela mostrava
 * `undefined` (ARQ-10 da revisão de 2026-09-23). Os clientes tipados de cada módulo (`*-client.ts`)
 * passam por aqui, com o tipo de resposta que a rota também anota.
 */

/** O corpo de erro que as rotas devolvem: `{ error, message }`, às vezes com campos a mais. */
export interface ApiErrorBody {
  readonly error?: string;
  readonly message?: string;
  readonly [extra: string]: unknown;
}

/**
 * A rota respondeu, e respondeu que não.
 *
 * Diferente de falha de rede ou de corpo que não é JSON — essas sobem como o `TypeError` ou o
 * `SyntaxError` de sempre, e a tela que quer distinguir "o servidor recusou" de "não deu para
 * falar com o servidor" distingue pelo tipo.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
  ) {
    super(typeof body.message === "string" ? body.message : `Falha (HTTP ${status}).`);
    this.name = "ApiError";
  }

  /** A mensagem que a rota mandou, ou `null` quando ela não mandou nenhuma. */
  get serverMessage(): string | null {
    return typeof this.body.message === "string" ? this.body.message : null;
  }
}

/**
 * Faz a requisição e lê o JSON; recusa com `ApiError` quando o status não é 2xx.
 *
 * O JSON é lido **antes** de olhar o status, como as telas faziam: um 500 sem corpo JSON sobe como
 * erro de leitura, não como `ApiError` sem mensagem.
 */
export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json()) as unknown;
  if (!response.ok) throw new ApiError(response.status, asErrorBody(payload));
  return payload as T;
}

/** `POST`/`PATCH`/`PUT`/`DELETE` com corpo JSON. */
export function sendJson<T>(url: string, method: string, body?: unknown): Promise<T> {
  return requestJson<T>(url, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
}

/**
 * A resposta lida sem decidir por quem chama: status e corpo, com os campos de sucesso opcionais.
 *
 * Para as telas que tratam a recusa e a resposta incompleta do mesmo jeito ("faltou o `id`" e
 * "a rota disse não" dão a mesma mensagem). Corpo que não é JSON sobe como erro de leitura.
 */
export interface JsonReply<T> {
  readonly ok: boolean;
  readonly status: number;
  readonly body: Partial<T> & ApiErrorBody;
}

export async function readReply<T>(url: string, init?: RequestInit): Promise<JsonReply<T>> {
  const response = await fetch(url, init);
  const payload = (await response.json()) as unknown;
  return {
    ok: response.ok,
    status: response.status,
    body: asErrorBody(payload) as Partial<T> & ApiErrorBody,
  };
}

/**
 * Como `readReply`, mas um corpo que não é JSON vira `{}` em vez de erro de leitura: só a rede
 * fora lança.
 *
 * Para os gestos em que o status basta — gravar e recarregar a tela com sucesso ou recusa, saber se
 * o reconhecimento em lote passou — e para quem lê a mensagem quando ela vem, mas não pode cair
 * porque um proxy respondeu HTML no lugar da rota (o autosave, o scan).
 */
export async function readLenientReply<T>(url: string, init?: RequestInit): Promise<JsonReply<T>> {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => null)) as unknown;
  return {
    ok: response.ok,
    status: response.status,
    body: asErrorBody(payload) as Partial<T> & ApiErrorBody,
  };
}

function asErrorBody(payload: unknown): ApiErrorBody {
  return typeof payload === "object" && payload !== null ? (payload as ApiErrorBody) : {};
}
