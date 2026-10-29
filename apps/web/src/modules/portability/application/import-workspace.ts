import type { PortableWorkspace } from "../domain/portable-schema";
import { translateSnapshotIds } from "../domain/snapshot-ids";
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
  readonly by: "legacyId" | "legacyUuid" | "isbn";
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
  /**
   * ISBN normalizado → id no destino. A chave que funciona para livro nascido **no app**.
   *
   * `legacyId` e `legacyUuid` são identidade de origem, e só existem em quem veio do sistema
   * legado. Um livro cadastrado aqui hoje, exportado e reimportado, não colidia por chave nenhuma
   * — duplicava em silêncio, e a simulação dizia "0 conflitos" com toda a razão e nenhuma
   * utilidade.
   *
   * O ISBN é o identificador que a própria pessoa digitou, e ele **significa** "é este livro" fora
   * deste banco e fora deste produto. Usá-lo não muda o que um `.lbb` é: continua sendo um despejo
   * sem identidade sintética — o que muda é que agora dá para reconhecer o livro pelo número que
   * está na contracapa dele.
   */
  readonly publicationsByIsbn: ReadonlyMap<string, string>;
  readonly questionsByLegacyId: ReadonlyMap<number, string>;
}

export const EMPTY_INDEX: ExistingIndex = {
  publicationsByLegacyId: new Map(),
  publicationsByLegacyUuid: new Map(),
  publicationsByIsbn: new Map(),
  questionsByLegacyId: new Map(),
};

/**
 * O ISBN sem o que é enfeite de impressão.
 *
 * `978-85-357-0011-4` e `9788535700114` são o mesmo livro, e a ficha catalográfica escreve dos dois
 * jeitos. Comparar sem normalizar deixaria passar a duplicata mais óbvia que existe.
 */
export const normalizeIsbn = (value: string | null | undefined): string | null => {
  if (!value) return null;

  const limpo = value.replace(/[\s-]/g, "").toUpperCase();
  return limpo === "" ? null : limpo;
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
    const isbn = normalizeIsbn(publication.isbn);
    if (isbn !== null) {
      const found = existing.publicationsByIsbn.get(isbn);
      if (found !== undefined) {
        collisions.push({ kind: "publication", by: "isbn", value: isbn, existingId: found });
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
      nickname: publication.nickname,
      isbn: publication.isbn,
      otherIdentifier: publication.otherIdentifier,
      edition: publication.edition,
      editionYear: publication.editionYear,
      publicationDate: publication.publicationDate,
      language: publication.language,
      series: publication.series,
      volume: publication.volume,
      notes: publication.notes,
      authors: publication.authors,
      captureProfileId: publication.captureProfileId,
      legacyId: publication.legacyId,
      legacyUuid: publication.legacyUuid,
      legacyUpdatedAt: publication.legacyUpdatedAt,
      metadataJson: publication.metadataJson,
      assets: publication.assets,
      coverAssetSha256: publication.coverAsset,
      sourcePdfAssetSha256: publication.sourcePdfAsset,
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
          slug: node.slug,
          sortKey: node.sortKey,
          numberingStyle: node.numberingStyle,
          originalLabel: node.originalLabel,
          legacyId: node.legacyId,
          deletedAt: node.deletedAt,
          bodyLatex: node.bodyLatex,
          anchors: node.anchors.map((anchor) => ({
            sha256: anchor.asset,
            cropSha256: anchor.cropAsset,
            pageNumber: anchor.pageNumber,
            box: anchor.box,
            rotation: anchor.rotation,
            role: anchor.role,
            sourceText: anchor.sourceText,
            extractionMethod: anchor.extractionMethod,
            extractionModel: anchor.extractionModel,
            metadataJson: anchor.metadataJson,
          })),
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
                  assets: question.assets,
                  options: question.options.map((option) => ({
                    id: newId(option.ref),
                    sortKey: option.sortKey,
                    statementLatex: option.statementLatex,
                    solutionLatex: option.solutionLatex,
                    originalLatex: option.originalLatex,
                    isCorrect: option.isCorrect,
                    weight: option.weight,
                    legacyId: option.legacyId,
                    legacyMarcacao: option.legacyMarcacao,
                  })),
                },
        };
      }),
    };
  });

  // As `ref` que o arquivo define: é por elas que avaliações e revisões apontam para o acervo.
  const refs = new Set<string>();
  for (const publication of portable.publications) {
    refs.add(publication.ref);
    for (const node of publication.nodes) {
      refs.add(node.ref);
      if (node.question === null) continue;
      refs.add(node.question.ref);
      for (const option of node.question.options) refs.add(option.ref);
    }
  }
  const idOf = (ref: string): string | undefined => (refs.has(ref) ? newId(ref) : undefined);

  return {
    workspace: {
      name: portable.name,
      slug: portable.slug,
      description: portable.description,
      legacyId: portable.legacyId,
      legacySourcePath: portable.legacySourcePath,
      tags: portable.tags,
      publications,
      assessments: portable.assessments.map((assessment) => ({
        title: assessment.title,
        subtitle: assessment.subtitle,
        notes: assessment.notes,
        sections: assessment.sections.map((section) => ({
          title: section.title,
          sortKey: section.sortKey,
          items: section.items.map((item) => ({
            questionId: newId(item.question),
            sortKey: item.sortKey,
            points: item.points,
            pinnedLastOptionIds: item.pinnedLastOptions.map(newId),
          })),
        })),
        variants: assessment.variants.map((variant) => ({
          label: variant.label,
          seed: variant.seed,
          shuffleQuestions: variant.shuffleQuestions,
          shuffleOptions: variant.shuffleOptions,
          createdAt: variant.createdAt,
          questions: variant.questions.map((entry) => ({
            questionId: newId(entry.question),
            position: entry.position,
            options: entry.options.map((option) => ({
              optionId: newId(option.option),
              displayedLabel: option.displayedLabel,
              position: option.position,
            })),
          })),
        })),
      })),
      templates: portable.templates,
      revisions: portable.revisions.map((revision) => ({
        entityType: revision.entityType,
        entityId: newId(revision.entity),
        revisionNumber: revision.revisionNumber,
        origin: revision.origin,
        summary: revision.summary,
        snapshotJson: translateSnapshotIds(revision.snapshotJson, idOf),
        createdAt: revision.createdAt,
      })),
    },
    collisions,
  };
}
