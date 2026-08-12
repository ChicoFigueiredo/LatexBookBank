import { NextResponse } from "next/server";

import { collectDiagnostics } from "@modules/diagnostics/application/collect-diagnostics";

import { toErrorResponse } from "../tree-http";

/**
 * A infraestrutura viva, para a barra de status (protótipo: `local-first · worker de render:
 * pronto · gemma3:12b carregado · backup há 1 h`).
 *
 * É a §9 das divergências, e o argumento dela é prático: o worker de render e o modelo carregado
 * são **justamente o que o usuário precisa saber antes de mandar renderizar**. Descobrir que o
 * worker está parado depois de clicar em "Renderizar" e esperar o timeout é a versão cara da
 * mesma informação.
 *
 * Por `fetch` do cliente e **não** pelo layout raiz, apesar de o segundo evitar uma requisição:
 * `probeRenderer` bate no worker com timeout, e pendurar isso no layout faria **toda** navegação
 * do produto esperar a rede antes do primeiro byte. Liveness é a única coisa nesta tela que pode
 * chegar depois — e a barra diz "verificando…" enquanto não chegou, em vez de mentir "pronto".
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const diagnostics = await collectDiagnostics();

    return NextResponse.json({
      renderer: { health: diagnostics.renderer.health, summary: diagnostics.renderer.summary },
      ai: { health: diagnostics.ai.health, summary: diagnostics.ai.summary },
      backup: { health: diagnostics.backup.health, summary: diagnostics.backup.summary },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
