import { vi } from "vitest";

/**
 * Um `fetch` que entrega a requisição ao Route Handler de verdade, sem servidor.
 *
 * É a costura do teste de contrato dos clientes tipados (`*-client.ts`, tarefa I8 da revisão de
 * 2026-09-23): o cliente monta a URL e o corpo como faz no navegador, a rota responde com o banco
 * temporário, e o teste lê o resultado pelo tipo que o cliente promete. Se rota e cliente
 * divergirem — um campo renomeado, um caminho errado —, é aqui que aparece, e não no E2E.
 *
 * Cada rota é `[método, padrão, carregar]`. O padrão usa `:nome` para os segmentos dinâmicos, que
 * chegam ao handler como o `params` do App Router (uma Promise). O que não casa com nenhuma rota
 * cai em `fallback` — o endpoint de IA dublado, por exemplo —, e sem `fallback` é erro: um teste
 * de contrato que fosse à rede por engano mediria a rede.
 */

type Handler = (
  request: Request,
  context: { params: Promise<Record<string, string>> },
) => Promise<Response> | Response;

export type RouteEntry = readonly [
  method: string,
  pattern: string,
  load: () => Promise<Record<string, unknown>>,
];

const ORIGIN = "http://127.0.0.1:28080";

function match(pattern: string, pathname: string): Record<string, string> | null {
  const want = pattern.split("/").filter(Boolean);
  const got = pathname.split("/").filter(Boolean);
  if (want.length !== got.length) return null;

  const params: Record<string, string> = {};
  for (const [index, segment] of want.entries()) {
    const actual = got[index] as string;
    if (segment.startsWith(":")) params[segment.slice(1)] = decodeURIComponent(actual);
    else if (segment !== actual) return null;
  }
  return params;
}

export function installRouteFetch(
  routes: readonly RouteEntry[],
  fallback?: (request: Request) => Promise<Response> | Response,
): { readonly calls: Request[]; restore(): void } {
  const calls: Request[] = [];

  const fake = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const raw = input instanceof Request ? input.url : String(input);
    const request = new Request(new URL(raw, ORIGIN), init);
    const { pathname } = new URL(request.url);
    const method = request.method.toUpperCase();

    for (const [routeMethod, pattern, load] of routes) {
      if (routeMethod !== method) continue;
      const params = match(pattern, pathname);
      if (params === null) continue;

      calls.push(request.clone());
      const handler = (await load())[method] as Handler | undefined;
      if (handler === undefined) throw new Error(`A rota ${pattern} não exporta ${method}.`);
      return handler(request, { params: Promise.resolve(params) });
    }

    if (fallback) return fallback(request);
    throw new Error(`Nenhuma rota de teste para ${method} ${pathname}.`);
  };

  vi.stubGlobal("fetch", vi.fn(fake));
  return { calls, restore: () => vi.unstubAllGlobals() };
}
