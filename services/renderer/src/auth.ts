import { timingSafeEqual } from "node:crypto";

/**
 * Autenticação por segredo compartilhado.
 *
 * O worker não tem usuários — tem **um** chamador, a aplicação. Um segredo no cabeçalho é a
 * autenticação proporcional a isso; JWT ou OAuth aqui seriam cerimônia com chaves para girar e
 * nada a mais para proteger.
 *
 * A comparação é em tempo constante. `a === b` sai no primeiro byte diferente, e a diferença de
 * tempo entre "errou no primeiro caractere" e "errou no último" é medível pela rede — é assim que
 * se descobre um segredo byte a byte, e o worker responde rápido justamente porque não faz mais
 * nada antes de comparar.
 */

const HEADER = "x-render-secret";

/**
 * Segredo mínimo. Não é política de senha: é o piso abaixo do qual força bruta vence antes de a
 * comparação em tempo constante importar.
 */
const MIN_SECRET_LENGTH = 32;

export class MissingSecretError extends Error {
  constructor() {
    super(
      "RENDERER_SECRET ausente ou curto demais (mínimo de 32 caracteres). " +
        "O worker recusa subir sem segredo — um renderer aberto compila o que qualquer um mandar.",
    );
    this.name = "MissingSecretError";
  }
}

/**
 * Lê o segredo do ambiente, ou recusa subir.
 *
 * Recusar é a escolha. O caminho fácil seria gerar um segredo aleatório quando falta, e aí o
 * worker sobe, "funciona", e ninguém descobre que está aberto até alguém varrer a porta. Falhar
 * na inicialização acontece na frente de quem está fazendo o deploy.
 */
export function requireSecret(env: Readonly<Record<string, string | undefined>>): string {
  const secret = env["RENDERER_SECRET"] ?? "";
  if (secret.length < MIN_SECRET_LENGTH) throw new MissingSecretError();
  return secret;
}

/** `true` quando o cabeçalho traz exatamente o segredo. */
export function isAuthorized(request: Request, secret: string): boolean {
  const offered = request.headers.get(HEADER);
  if (offered === null) return false;

  const a = Buffer.from(offered, "utf8");
  const b = Buffer.from(secret, "utf8");

  // `timingSafeEqual` exige tamanhos iguais e lança se diferirem — o que, sozinho, já vazaria o
  // tamanho do segredo pelo tipo da resposta. Comparar o tamanho antes e sair com `false` mantém
  // o vazamento no que ele já era: o tamanho, que não é o segredo.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const AUTH_HEADER = HEADER;
