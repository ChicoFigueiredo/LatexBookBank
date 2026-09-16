import { readHomeOverview } from "@modules/workspaces/infrastructure/prisma-home-overview";
import { relativeTime } from "@/shared/format/relative-time";

import { HomeScreen } from "./home-screen";

/**
 * A Home do acervo.
 *
 * Server Component: os repositórios rodam aqui e só DTO atravessa para o cliente. Nenhum
 * componente importa Prisma — a regra de lint recusaria.
 *
 * **Sem `demo`.** A versão anterior listava as publicações do workspace `demo` hardcoded, o que
 * fazia a primeira tela do produto depender de um seed. Agora ela responde às três situações
 * reais: zero bibliotecas, uma, várias (§63 do prompt do time).
 */

/**
 * Dinâmica, não estática: a lista muda conforme o autor cria e importa publicações, e um
 * snapshot de build serviria dados velhos. No build também não há banco a consultar.
 */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const overview = await readHomeOverview();

  // Um relógio só, aqui, para a página inteira. Formatar no cliente fazia servidor e hidratação
  // discordarem na virada do minuto — e uma hidratação abortada deixa a Home sem reagir a clique.
  const agora = new Date();

  return (
    <HomeScreen
      greeting={saudacao(agora)}
      libraries={overview.libraries.map((library) => ({
        ...library,
        updatedLabel: relativeTime(library.updatedAt, agora),
      }))}
      continueWhere={
        overview.continueWhere
          ? {
              ...overview.continueWhere,
              updatedLabel: relativeTime(overview.continueWhere.updatedAt, agora),
              sourceLabel: overview.continueWhere.source
                ? `${overview.continueWhere.source.filename} · ${megabytes(overview.continueWhere.source.sizeBytes)}`
                : null,
            }
          : null
      }
      pending={overview.pending}
      recent={overview.recent.map((entry) => ({
        ...entry,
        updatedLabel: relativeTime(entry.updatedAt, agora),
      }))}
    />
  );
}

/**
 * "Bom dia" / "Boa tarde" / "Boa noite".
 *
 * Decidido aqui e não no cliente pelo mesmo motivo dos rótulos de tempo: o relógio consultado duas
 * vezes é o relógio que discorda de si mesmo. Sem nome junto — o produto é local e de uma pessoa
 * só, e não há cadastro de quem está do outro lado para saudar pelo nome.
 */
function saudacao(agora: Date): string {
  const hora = agora.getHours();
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

const megabytes = (bytes: number): string =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
