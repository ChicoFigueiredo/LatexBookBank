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
      // A ficha catalográfica atravessa inteira: era ela que sumia no ida-e-volta do backup.
      // `?? null` porque arquivo gravado antes destes campos não os traz, e ausente é `null`.
      nickname: publication.nickname ?? null,
      isbn: publication.isbn ?? null,
      otherIdentifier: publication.otherIdentifier ?? null,
      edition: publication.edition ?? null,
      editionYear: publication.editionYear ?? null,
      language: publication.language ?? null,
      series: publication.series ?? null,
      volume: publication.volume ?? null,
      notes: publication.notes ?? null,
      authors: publication.authors ?? [],
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
