import { realpath } from "node:fs/promises";
import path from "node:path";

import { env } from "@/shared/config/env";

import { BadRequestError } from "../http";

/**
 * A pasta pedida não está sob a raiz que o servidor permite (#256, SEC-05).
 *
 * 403, e com a mesma mensagem para a pasta que existe e para a que não existe: a diferença contaria
 * a quem pergunta o que há no disco do servidor.
 */
export class CatalogRootNotAllowedError extends Error {
  constructor(readonly configured: boolean) {
    super(
      configured
        ? "Esta pasta não fica dentro da biblioteca Calibre configurada (`CALIBRE_LIBRARY_ROOT`)."
        : "Nenhuma biblioteca Calibre está configurada: defina `CALIBRE_LIBRARY_ROOT` no `.env.local`.",
    );
    this.name = "CatalogRootNotAllowedError";
  }
}

/**
 * A raiz do catálogo, **decidida pelo servidor** (#256, SEC-05).
 *
 * `CALIBRE_LIBRARY_ROOT` era só o valor inicial da tela, e o servidor abria o `metadata.db` de
 * qualquer pasta absoluta que o corpo trouxesse. Agora ele é a cerca: a pasta pedida precisa ser
 * a raiz configurada ou estar dentro dela — e isso conferido **depois** de resolver os symlinks,
 * porque `Livros/atalho` pode ser, no disco, qualquer outro lugar. Sem raiz configurada, nenhum
 * catálogo abre: escolher a pasta continua sendo da tela, dentro do que o servidor permite.
 *
 * Devolve o caminho real, e é ele que o adaptador usa como raiz de contenção de cada arquivo.
 */
export async function resolveCatalogRoot(
  value: unknown,
  allowedRoot: string | null = env().calibreLibraryRoot,
): Promise<string> {
  const pedido = parseCatalogPath(value);
  if (allowedRoot === null) throw new CatalogRootNotAllowedError(false);

  const raiz = await realOrResolved(allowedRoot);
  const alvo = await realOrResolved(pedido);

  // O separador no fim evita que `/Livros-2` passe por estar dentro de `/Livros`.
  if (alvo !== raiz && !alvo.startsWith(raiz.endsWith(path.sep) ? raiz : raiz + path.sep)) {
    throw new CatalogRootNotAllowedError(true);
  }
  return alvo;
}

/**
 * O caminho real, e o resolvido quando ele não existe: uma pasta que não existe dentro da raiz
 * chega ao adaptador, que diz "não há `metadata.db`"; uma de fora é recusada antes, sem que
 * existir ou não mude a resposta.
 */
async function realOrResolved(caminho: string): Promise<string> {
  try {
    return await realpath(caminho);
  } catch {
    return path.resolve(caminho);
  }
}

/**
 * O caminho da biblioteca, conferido antes de virar leitura de disco.
 *
 * **A entrada é do usuário e vira acesso ao filesystem** — é a superfície mais perigosa deste
 * módulo (§75). Três recusas:
 *
 * - vazio ou não-texto;
 * - caminho relativo, que dependeria do diretório de trabalho do servidor e resolveria para
 *   lugares diferentes conforme quem subiu a aplicação;
 * - `\0`, que trunca o caminho dentro do syscall e faz `/etc/passwd\0.db` virar `/etc/passwd`.
 *
 * O que **não** é recusado aqui: `..`. Ele sai na resolução do caminho real, e o resultado é que
 * é conferido contra a raiz configurada (`resolveCatalogRoot`). Cada arquivo lido é conferido de
 * novo, no adaptador, contra a pasta que esta conferência aprovou.
 */
function parseCatalogPath(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new BadRequestError("Informe a pasta da biblioteca Calibre.");
  }
  if (value.includes("\0")) {
    throw new BadRequestError("Caminho inválido.");
  }

  const caminho = value.trim();
  // Windows (`C:\...`), POSIX (`/mnt/...`) e UNC (`\\servidor\...`). Um caminho relativo não é
  // recusado por ser perigoso — é recusado por ser ambíguo.
  if (!/^([a-zA-Z]:[\\/]|\/|\\\\)/.test(caminho)) {
    throw new BadRequestError("Use o caminho completo da pasta, não um caminho relativo.");
  }

  return caminho;
}
