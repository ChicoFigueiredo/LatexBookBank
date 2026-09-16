import { PORTABLE_FORMAT_VERSION, type PortableWorkspace } from "./portable-schema";

/**
 * Os migradores do `.lbb` (D37, ADR 0001) — um por salto de versão, aplicados em sequência.
 *
 * O primeiro é o `v1 → v2`: a v1 não conhecia corpo de nó, âncora de nó nem PDF fonte, e o que ela
 * não conhecia chega **vazio**, não inventado. Um arquivo antigo importa sem perder nada do que
 * tinha; o que ele nunca teve continua não existindo.
 */

type Migration = (workspace: PortableWorkspace) => PortableWorkspace;

const MIGRATIONS: Readonly<Record<number, Migration>> = {
  1: (workspace) => ({
    ...workspace,
    publications: workspace.publications.map((publication) => ({
      ...publication,
      sourcePdfAsset: publication.sourcePdfAsset ?? null,
      nodes: publication.nodes.map((node) => ({
        ...node,
        bodyLatex: node.bodyLatex ?? "",
        anchors: node.anchors ?? [],
      })),
    })),
  }),
};

export function migrateToCurrent(workspace: PortableWorkspace, fromVersion: number): PortableWorkspace {
  let current = workspace;
  for (let version = fromVersion; version < PORTABLE_FORMAT_VERSION; version++) {
    const step = MIGRATIONS[version];
    if (!step) throw new Error(`Falta o migrador do .lbb v${version} → v${version + 1}.`);
    current = step(current);
  }
  return current;
}
