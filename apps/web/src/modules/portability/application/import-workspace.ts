import type { PortableWorkspace } from "../domain/portable-schema";
import type { RuntimeWorkspace } from "./export-workspace";

/**
 * A projeção **portable → runtime**.
 *
 * O par da de export, e o motivo de as duas serem funções puras: o round-trip que prova o formato
 * é `toRuntime(toPortable(x))`, e um teste que precisasse de banco para isso seria um teste que se
 * roda menos.
 *
 * As `ref` do arquivo viram ids novos aqui — não são reaproveitadas como uuid. Um `ref` é
 * identidade **dentro do arquivo**; usá-lo no banco criaria colisão na segunda importação do
 * mesmo `.lbb`, que é justamente o caso de uso de backup.
 *
 * Ver spec §7 · issue #115.
 */

export interface ImportCollision {
  readonly kind: "publication" | "question";
  readonly by: "legacyId" | "legacyUuid";
  readonly value: string | number;
  readonly existingId: string;
}

export interface ImportPlan {
  readonly workspace: RuntimeWorkspace;
  /**
   * O que já existe no destino.
   *
   * **Nada é sobrescrito em silêncio**: quem chama recebe a lista e decide. Um import que
   * atualizasse por conta própria transformaria "trazer um acervo" em "sobrescrever o meu", e a
   * diferença só apareceria depois de o trabalho de alguém sumir.
   */
  readonly collisions: readonly ImportCollision[];
}

export interface ExistingIndex {
  /** `legacyId` de publicação → id no destino. */
  readonly publicationsByLegacyId: ReadonlyMap<number, string>;
  readonly publicationsByLegacyUuid: ReadonlyMap<string, string>;
  readonly questionsByLegacyId: ReadonlyMap<number, string>;
}

export const EMPTY_INDEX: ExistingIndex = {
  publicationsByLegacyId: new Map(),
  publicationsByLegacyUuid: new Map(),
  questionsByLegacyId: new Map(),
};

/**
 * Monta o plano: o que entraria, e o que colidiria.
 *
 * `newId` é injetável porque o round-trip precisa de ids estáveis para comparar — e porque um
 * gerador de uuid escondido dentro de uma projeção é uma dependência que não aparece na
 * assinatura.
 */
export function toRuntime(
  portable: PortableWorkspace,
  existing: ExistingIndex = EMPTY_INDEX,
  newId: (ref: string) => string = (ref) => ref,
): ImportPlan {
  const collisions: ImportCollision[] = [];

  const publications = portable.publications.map((publication) => {
    if (publication.legacyId !== null) {
      const found = existing.publicationsByLegacyId.get(publication.legacyId);
      if (found !== undefined) {
        collisions.push({
          kind: "publication",
          by: "legacyId",
          value: publication.legacyId,
          existingId: found,
        });
      }
    }
    if (publication.legacyUuid !== null) {
      const found = existing.publicationsByLegacyUuid.get(publication.legacyUuid);
      if (found !== undefined) {
        collisions.push({
          kind: "publication",
          by: "legacyUuid",
          value: publication.legacyUuid,
          existingId: found,
        });
      }
    }

    return {
      id: newId(publication.ref),
      title: publication.title,
      subtitle: publication.subtitle,
      publisher: publication.publisher,
      legacyId: publication.legacyId,
      legacyUuid: publication.legacyUuid,
      metadataJson: publication.metadataJson,
      coverAssetSha256: publication.coverAsset,
      nodes: publication.nodes.map((node) => {
        const question = node.question;

        if (question !== null && question.legacyId !== null) {
          const found = existing.questionsByLegacyId.get(question.legacyId);
          if (found !== undefined) {
            collisions.push({
              kind: "question",
              by: "legacyId",
              value: question.legacyId,
              existingId: found,
            });
          }
        }

        return {
          id: newId(node.ref),
          parentId: node.parentRef === null ? null : newId(node.parentRef),
          kind: node.kind,
          title: node.title,
          sortKey: node.sortKey,
          numberingStyle: node.numberingStyle,
          originalLabel: node.originalLabel,
          legacyId: node.legacyId,
          question:
            question === null
              ? null
              : {
                  id: newId(question.ref),
                  type: question.type,
                  nickname: question.nickname,
                  statementLatex: question.statementLatex,
                  solutionLatex: question.solutionLatex,
                  complementLatex: question.complementLatex,
                  originalLatex: question.originalLatex,
                  difficulty: question.difficulty,
                  year: question.year,
                  board: question.board,
                  institution: question.institution,
                  role: question.role,
                  roleLevel: question.roleLevel,
                  publisher: question.publisher,
                  videoUrl: question.videoUrl,
                  status: question.status,
                  validationStatus: question.validationStatus,
                  legacyId: question.legacyId,
                  tags: question.tags,
                  assetSha256: question.assets,
                  options: question.options.map((option) => ({
                    id: newId(option.ref),
                    sortKey: option.sortKey,
                    statementLatex: option.statementLatex,
                    solutionLatex: option.solutionLatex,
                    isCorrect: option.isCorrect,
                    weight: option.weight,
                    legacyId: option.legacyId,
                  })),
                },
        };
      }),
    };
  });

  return {
    workspace: {
      name: portable.name,
      slug: portable.slug,
      tags: portable.tags,
      publications,
    },
    collisions,
  };
}
