import { NextResponse, type NextRequest } from "next/server";

/**
 * O perímetro do app (#242, SEC-01 da revisão de 2026-09-23).
 *
 * A API não tem autenticação — é local-first, de uma pessoa só —, então quem alcança a porta lê,
 * exporta e apaga o acervo. Duas camadas fecham isso:
 *
 * - `dev` e `start` escutam só em `127.0.0.1` (`package.json`): a rede local não alcança a porta;
 * - este proxy recusa o que chega **pelo navegador da própria pessoa** vindo de outro site. Uma
 *   página qualquer consegue falar com `localhost` de dois jeitos: por DNS rebinding, em que o
 *   domínio dela passa a resolver para `127.0.0.1` e o `Host` chega com o nome dela; e por CSRF,
 *   em que o formulário ou o `fetch` sai da página dela e o `Origin` diz isso.
 *
 * O Next só barra o cruzamento de origem nos próprios endpoints internos (`/_next`), não em
 * `/api/*` — por isso a regra mora aqui, antes de qualquer rota.
 */

/**
 * Fixa, e não configuração: o app é de uma máquina só (D59, `_planejamento.md` §3.8). O modo cloud
 * (§4.2) precisa de autenticação de verdade antes de qualquer coisa; nesse dia esta lista vira
 * configuração, junto com ela.
 */
const LOCAL_HOSTNAMES: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Métodos que não escrevem: a navegação vinda de outro site (um link) é legítima e continua. */
const SAFE_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS"]);

export function proxy(request: NextRequest): NextResponse {
  const host = request.headers.get("host");
  if (!LOCAL_HOSTNAMES.has(hostnameOf(host))) {
    return forbidden("foreign_host", "Este endereço não é desta máquina.");
  }

  if (!SAFE_METHODS.has(request.method)) {
    // Sem `Origin` é quem não é navegador — o `curl` desta máquina, um script —, e a porta só
    // escuta em `127.0.0.1`. Com `Origin`, ela precisa ser esta mesma: o navegador manda o
    // cabeçalho em toda escrita entre origens, inclusive no `fetch` em modo `no-cors`.
    const origin = request.headers.get("origin");
    // `Sec-Fetch-Site` é a mesma informação dita pelo navegador de outro jeito, e vale quando o
    // `Origin` não veio.
    const crossSite = request.headers.get("sec-fetch-site") === "cross-site";
    if ((origin !== null && hostOf(origin) !== host) || crossSite) {
      return forbidden("foreign_origin", "Pedido de outra origem recusado.");
    }
  }

  return NextResponse.next();
}

/** O `host:porta` de um `Origin`; `null` (a origem opaca de sandbox) e lixo viram vazio. */
function hostOf(origin: string): string {
  try {
    return new URL(origin).host;
  } catch {
    return "";
  }
}

/** `localhost:28080` → `localhost`; `[::1]:28080` → `[::1]`. Host ausente ou inválido → vazio. */
function hostnameOf(host: string | null): string {
  if (host === null) return "";
  try {
    return new URL(`http://${host}`).hostname;
  } catch {
    return "";
  }
}

function forbidden(error: string, message: string): NextResponse {
  return NextResponse.json({ error, message }, { status: 403 });
}

export const config = {
  // Tudo, menos os arquivos estáticos do build: um `Host` estranho também não deve ler página.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
