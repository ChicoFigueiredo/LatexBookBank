import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Todo id que uma rota lê do corpo passa por um guarda de escopo (SEC-06, C3 da revisão de código).
 *
 * O `agentRunId` vinha do corpo e ia para a revisão sem conferência: o defeito não era aquela rota,
 * era o hábito de confiar no id que o cliente manda. Esta varredura acha cada `body["…Id"]` e
 * `form.get("…Id")` em `app/api/**\/route.ts` e exige que ele esteja declarado aqui, de um de dois
 * jeitos:
 *
 * - **guardado**: o nome do guarda — o erro que recusa, ou a função que confere — aparece na rota ou
 *   num módulo que ela importa. A recusa sai pela tabela de `app/api/http.ts`.
 * - **próprio**: o id é o escopo, e não há escopo maior com que compará-lo (a biblioteca, a questão
 *   em foco de uma rota global, o id do catálogo Calibre, um perfil de captura do vocabulário).
 *
 * Uma rota nova que lê um id do corpo sem estar aqui falha: é a pergunta "quem confere isto?" feita
 * no dia em que a rota nasce. O precedente é o guarda das rotas de questão, em `hardening.test.ts`.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const api = path.join(root, "app/api");

type Escopo = { readonly guarda: string; readonly porque: string } | { readonly proprio: string };

const QUESTAO_EM_FOCO = { proprio: "a questão em foco é o escopo da rota global do agente" };

const ESCOPO: Readonly<Record<string, Readonly<Record<string, Escopo>>>> = {
  "agents/ask/route.ts": { questionId: QUESTAO_EM_FOCO },
  "agents/candidate-render/route.ts": { questionId: QUESTAO_EM_FOCO },
  "agents/patches/apply/route.ts": {
    questionId: QUESTAO_EM_FOCO,
    agentRunId: {
      guarda: "AgentRunOutOfScopeError",
      porque: "o turno citado tem de ser um turno sobre esta questão",
    },
    approvedChangeIds: {
      proprio: "não é id de entidade: é a linha do diff, recalculada do estado",
    },
  },
  "agents/patches/revert/route.ts": { questionId: QUESTAO_EM_FOCO },
  "assessments/[assessmentId]/questions/route.ts": {
    questionId: { guarda: '"foreign"', porque: "a questão de outra biblioteca não entra na prova" },
  },
  "assessments/route.ts": { workspaceId: { proprio: "a biblioteca é o escopo da prova nova" } },
  "assets/crop/route.ts": {
    sourceAssetId: { guarda: "CropSourceNotFoundError", porque: "o PDF fonte tem de existir" },
    publicationId: {
      guarda: "CropOwnerNotFoundError",
      porque: "o livro tem de ser da biblioteca do PDF (#256)",
    },
    questionId: {
      guarda: "CropOwnerNotFoundError",
      porque: "a questão tem de ser da biblioteca do PDF (#256)",
    },
  },
  "assets/route.ts": {
    publicationId: { guarda: "resolveAssetOwner(", porque: "livro, biblioteca e questão: um dono" },
    workspaceId: { guarda: "resolveAssetOwner(", porque: "livro, biblioteca e questão: um dono" },
    questionId: { guarda: "resolveAssetOwner(", porque: "livro, biblioteca e questão: um dono" },
  },
  "catalog/attach/route.ts": {
    publicationId: { proprio: "o livro que recebe o PDF é o escopo" },
    externalId: { proprio: "id do catálogo Calibre, de fora do acervo" },
  },
  "catalog/import-batch/route.ts": {
    externalIds: { proprio: "ids do catálogo Calibre, de fora do acervo" },
    libraryId: { proprio: "a biblioteca que recebe os livros é o escopo" },
  },
  "catalog/import/route.ts": {
    libraryId: { proprio: "a biblioteca que recebe o livro é o escopo" },
    externalId: { proprio: "id do catálogo Calibre, de fora do acervo" },
  },
  "catalog/route.ts": { libraryId: { proprio: "a biblioteca consultada é o escopo" } },
  "publications/[id]/questions/from-recognition/route.ts": {
    anchorId: {
      guarda: "RecognitionProvenanceError",
      porque: "a âncora tem de ser do livro da URL e do recorte aprovado",
    },
    cropAssetId: {
      guarda: "RecognitionProvenanceError",
      porque: "a âncora tem de ser do livro da URL e do recorte aprovado",
    },
  },
  "publications/[id]/scans/route.ts": {
    profileId: { proprio: "perfil de captura do vocabulário, não entidade do acervo" },
  },
  "recognition/route.ts": {
    cropAssetId: { guarda: "CropAnchor", porque: "a transcrição só vai para a âncora do recorte" },
    anchorId: { guarda: "CropAnchor", porque: "a transcrição só vai para a âncora do recorte" },
  },
  "scans/[runId]/approve/route.ts": {
    destinationId: {
      guarda: "DestinationNotInPublicationError",
      porque: "o destino tem de ser do livro da varredura",
    },
  },
  "scans/[runId]/switch-profile/route.ts": {
    profileId: { proprio: "perfil de captura do vocabulário, não entidade do acervo" },
  },
};

/** `body["xId"]`, `body["xIds"]`, `form.get("xId")` — o id que o cliente escreve. */
const ID_DO_CORPO = /\b(?:body|form)(?:\[\s*"(\w+Ids?)"\s*\]|\.get\(\s*"(\w+Ids?)"\s*\))/g;

const rotas = (readdirSync(api, { recursive: true, encoding: "utf8" }) as string[])
  .filter((file) => file.endsWith("route.ts"))
  .map((file) => file.split(path.sep).join("/"));

function idsDoCorpo(rota: string): string[] {
  const code = readFileSync(path.join(api, rota), "utf8");
  return [...new Set([...code.matchAll(ID_DO_CORPO)].map((m) => (m[1] ?? m[2]) as string))];
}

/** O arquivo de um import da rota, pelos aliases do `tsconfig`; `null` para pacote de fora. */
function resolver(specifier: string, from: string): string | null {
  const base = specifier.startsWith("@modules/")
    ? path.join(root, "src/modules", specifier.slice("@modules/".length))
    : specifier.startsWith("@infrastructure/")
      ? path.join(root, "src/infrastructure", specifier.slice("@infrastructure/".length))
      : specifier.startsWith("@/")
        ? path.join(root, "src", specifier.slice(2))
        : specifier.startsWith(".")
          ? path.resolve(path.dirname(from), specifier)
          : null;
  if (base === null) return null;
  return [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")].find(existsSync) ?? null;
}

/** A rota e o que ela importa: é onde o guarda pode morar (a regra é do caso de uso, D71). */
function codigoAlcancado(rota: string): string {
  const file = path.join(api, rota);
  const code = readFileSync(file, "utf8");
  const imports = [...code.matchAll(/from\s+["']([^"']+)["']/g)]
    .map((m) => resolver(m[1] as string, file))
    .filter((found): found is string => found !== null);
  return [code, ...imports.map((found) => readFileSync(found, "utf8"))].join("\n");
}

describe("todo id lido do corpo passa por um guarda de escopo", () => {
  const lidas = rotas.filter((rota) => idsDoCorpo(rota).length > 0);

  it("há rotas para varrer", () => {
    expect(lidas.length).toBeGreaterThanOrEqual(15);
  });

  it("cada id lido do corpo está declarado, guardado ou próprio", () => {
    const soltos = lidas.flatMap((rota) =>
      idsDoCorpo(rota)
        .filter((campo) => ESCOPO[rota]?.[campo] === undefined)
        .map((campo) => `${rota} → ${campo}`),
    );

    expect(soltos).toEqual([]);
  });

  it("o guarda declarado é alcançado pela rota", () => {
    const semGuarda = Object.entries(ESCOPO).flatMap(([rota, campos]) =>
      Object.entries(campos).flatMap(([campo, escopo]) =>
        "guarda" in escopo && !codigoAlcancado(rota).includes(escopo.guarda)
          ? [`${rota} → ${campo} (${escopo.guarda})`]
          : [],
      ),
    );

    expect(semGuarda).toEqual([]);
  });

  it("o erro do guarda tem linha na tabela de http.ts, e não vira 500", () => {
    const tabela = readFileSync(path.join(api, "http.ts"), "utf8");
    const erros = Object.values(ESCOPO)
      .flatMap((campos) => Object.values(campos))
      .flatMap((escopo) =>
        "guarda" in escopo && /^\w+Error$/.test(escopo.guarda) ? [escopo.guarda] : [],
      );

    expect([...new Set(erros)].filter((erro) => !tabela.includes(`on(${erro}`))).toEqual([]);
  });

  it("nenhuma declaração sobra de rota ou campo que já não lê o id", () => {
    const sobras = Object.entries(ESCOPO).flatMap(([rota, campos]) =>
      Object.keys(campos)
        .filter((campo) => !rotas.includes(rota) || !idsDoCorpo(rota).includes(campo))
        .map((campo) => `${rota} → ${campo}`),
    );

    expect(sobras).toEqual([]);
  });
});
