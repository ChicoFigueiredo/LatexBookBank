import type {
  PortableAsset,
  PortableAssessment,
  PortableNode,
  PortableOption,
  PortablePublication,
  PortableQuestion,
  PortableRevision,
  PortableTemplate,
  PortableWorkspace,
} from "../domain/portable-schema";
import { translateSnapshotIds } from "../domain/snapshot-ids";

/**
 * A projeção **runtime → portable**.
 *
 * Uma função pura, separada da leitura do banco, e é isso que a torna testável: o round-trip
 * exercita as duas projeções sem precisar de Prisma nenhum. Se a projeção morasse dentro do
 * repositório, testar o formato exigiria um banco — e um teste que exige banco é um teste que se
 * roda menos.
 *
 * Os uuids de runtime **não** atravessam. O que sai é uma referência local ao arquivo (`ref`),
 * porque importar num workspace que já tem aquele uuid seria colisão inventada, e carregar o uuid
 * de origem amarraria o arquivo ao banco que o gerou.
 *
 * Ver spec §7 · issue #115.
 */

export interface RuntimeWorkspace {
  readonly name: string;
  readonly slug: string;
  readonly description: string | null;
  readonly legacyId: number | null;
  readonly legacySourcePath: string | null;
  readonly tags: readonly { readonly name: string; readonly kind: string }[];
  readonly publications: readonly RuntimePublication[];
  readonly assessments: readonly RuntimeAssessment[];
  readonly templates: readonly RuntimeTemplate[];
  readonly revisions: readonly RuntimeRevision[];
}

export interface RuntimeAssessment {
  readonly title: string;
  readonly subtitle: string | null;
  readonly notes: string | null;
  readonly sections: readonly {
    readonly title: string | null;
    readonly sortKey: string;
    readonly items: readonly {
      readonly questionId: string;
      readonly sortKey: string;
      readonly points: number | null;
      readonly pinnedLastOptionIds: readonly string[];
    }[];
  }[];
  readonly variants: readonly {
    readonly label: string;
    readonly seed: number;
    readonly shuffleQuestions: boolean;
    readonly shuffleOptions: boolean;
    readonly createdAt: string;
    readonly questions: readonly {
      readonly questionId: string;
      readonly position: number;
      readonly options: readonly {
        readonly optionId: string;
        readonly displayedLabel: string;
        readonly position: number;
      }[];
    }[];
  }[];
}

/** O template não cita id nenhum: o mesmo formato do portable. */
export type RuntimeTemplate = PortableTemplate;

export interface RuntimeRevision {
  readonly entityType: string;
  readonly entityId: string;
  readonly revisionNumber: number;
  readonly origin: string;
  readonly summary: string;
  readonly snapshotJson: string;
  readonly createdAt: string;
}

/** O asset descrito — o mesmo formato do portable: não há id de runtime nele para traduzir. */
export type RuntimeAsset = PortableAsset;

export interface RuntimePublication {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly publisher: string | null;
  readonly legacyId: number | null;
  readonly legacyUuid: string | null;
  readonly legacyUpdatedAt: string | null;
  readonly metadataJson: string | null;
  /** A ficha catalográfica — ver `PortablePublication` para o porquê de ela ter faltado. */
  readonly nickname: string | null;
  readonly isbn: string | null;
  readonly otherIdentifier: string | null;
  readonly edition: string | null;
  readonly editionYear: number | null;
  readonly publicationDate: string | null;
  readonly language: string | null;
  readonly series: string | null;
  readonly volume: string | null;
  readonly notes: string | null;
  readonly authors: readonly string[];
  readonly captureProfileId: string | null;
  readonly assets: readonly RuntimeAsset[];
  readonly coverAssetSha256: string | null;
  readonly sourcePdfAssetSha256: string | null;
  readonly nodes: readonly RuntimeNode[];
}

export interface RuntimeAnchor {
  readonly sha256: string;
  readonly cropSha256: string | null;
  readonly pageNumber: number;
  readonly box: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly rotation: number | null;
  readonly role: string;
  readonly sourceText: string | null;
  readonly extractionMethod: string | null;
  readonly extractionModel: string | null;
  readonly metadataJson: string | null;
}

export interface RuntimeNode {
  readonly id: string;
  readonly parentId: string | null;
  readonly kind: string;
  readonly title: string | null;
  readonly slug: string | null;
  readonly sortKey: string;
  readonly numberingStyle: string;
  readonly originalLabel: string | null;
  readonly legacyId: number | null;
  readonly deletedAt: string | null;
  readonly question: RuntimeQuestion | null;
  readonly bodyLatex: string;
  readonly anchors: readonly RuntimeAnchor[];
}

export interface RuntimeQuestion {
  readonly id: string;
  readonly type: string;
  readonly nickname: string | null;
  readonly statementLatex: string;
  readonly solutionLatex: string;
  readonly complementLatex: string;
  readonly originalLatex: string | null;
  readonly difficulty: number;
  readonly year: number | null;
  readonly board: string | null;
  readonly institution: string | null;
  readonly role: string | null;
  readonly roleLevel: string | null;
  readonly publisher: string | null;
  readonly videoUrl: string | null;
  readonly status: string;
  readonly validationStatus: string;
  readonly legacyId: number | null;
  readonly tags: readonly string[];
  readonly options: readonly RuntimeOption[];
  readonly assets: readonly RuntimeAsset[];
}

export interface RuntimeOption {
  readonly id: string;
  readonly sortKey: string;
  readonly statementLatex: string;
  readonly solutionLatex: string;
  readonly originalLatex: string | null;
  readonly isCorrect: boolean;
  readonly weight: number | null;
  readonly legacyId: number | null;
  /** A letra `a`–`e` do legado. Só para auditoria do import — nunca identidade nem renderização. */
  readonly legacyMarcacao: string | null;
}

/**
 * Referências locais ao arquivo.
 *
 * Sequenciais e estáveis dentro do export: `pub-1`, `node-7`, `q-3`. Um uuid novo por item
 * funcionaria igual, e tornaria dois exports do mesmo workspace diferentes byte a byte — o que
 * impede comparar dois arquivos para ver se algo mudou.
 */
class RefMinter {
  private counters = new Map<string, number>();
  /** Todo id de runtime que ganhou `ref` — é por ele que avaliações e revisões se traduzem. */
  readonly refOf = new Map<string, string>();

  next(prefix: string, id?: string): string {
    const value = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, value);
    const ref = `${prefix}-${value}`;
    if (id !== undefined) this.refOf.set(id, ref);
    return ref;
  }
}

export function toPortable(runtime: RuntimeWorkspace): PortableWorkspace {
  const mint = new RefMinter();
  const publications = runtime.publications.map((publication) => toPublication(publication, mint));
  const refOf = (id: string) => mint.refOf.get(id);

  return {
    name: runtime.name,
    slug: runtime.slug,
    description: runtime.description,
    legacyId: runtime.legacyId,
    legacySourcePath: runtime.legacySourcePath,
    // Ordenadas: duas exportações do mesmo workspace precisam sair iguais, e a ordem em que o
    // banco devolve tags não é garantida.
    tags: [...runtime.tags].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    publications,
    assessments: runtime.assessments.map((assessment) => toAssessment(assessment, refOf)),
    templates: [...runtime.templates].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    revisions: toRevisions(runtime.revisions, refOf),
  };
}

/**
 * A avaliação com as questões e as alternativas trocadas pela `ref` do arquivo.
 *
 * Questão que não está no arquivo (de outra biblioteca, de antes do guarda da #177) sai do item e
 * da variante: não há para onde apontar no destino. Alternativa que não existe mais sai do mapa
 * pelo mesmo motivo — ela já não apontava para nada na origem.
 */
function toAssessment(
  assessment: RuntimeAssessment,
  refOf: (id: string) => string | undefined,
): PortableAssessment {
  const known = (ids: readonly string[]) =>
    ids.flatMap((id) => {
      const ref = refOf(id);
      return ref === undefined ? [] : [ref];
    });

  return {
    title: assessment.title,
    subtitle: assessment.subtitle,
    notes: assessment.notes,
    sections: assessment.sections.map((section) => ({
      title: section.title,
      sortKey: section.sortKey,
      items: section.items.flatMap((item) => {
        const question = refOf(item.questionId);
        if (question === undefined) return [];
        return [
          {
            question,
            sortKey: item.sortKey,
            points: item.points,
            pinnedLastOptions: known(item.pinnedLastOptionIds),
          },
        ];
      }),
    })),
    variants: assessment.variants.map((variant) => ({
      label: variant.label,
      seed: variant.seed,
      shuffleQuestions: variant.shuffleQuestions,
      shuffleOptions: variant.shuffleOptions,
      createdAt: variant.createdAt,
      questions: variant.questions.flatMap((entry) => {
        const question = refOf(entry.questionId);
        if (question === undefined) return [];
        return [
          {
            question,
            position: entry.position,
            options: entry.options.flatMap((option) => {
              const ref = refOf(option.optionId);
              if (ref === undefined) return [];
              return [{ option: ref, displayedLabel: option.displayedLabel, position: option.position }];
            }),
          },
        ];
      }),
    })),
  };
}

/** Por entidade e número: o banco não garante ordem, e o arquivo precisa sair igual. */
function toRevisions(
  revisions: readonly RuntimeRevision[],
  refOf: (id: string) => string | undefined,
): readonly PortableRevision[] {
  return revisions
    .flatMap((revision): PortableRevision[] => {
      const entity = refOf(revision.entityId);
      if (entity === undefined) return [];
      return [
        {
          entityType: revision.entityType,
          entity,
          revisionNumber: revision.revisionNumber,
          origin: revision.origin,
          summary: revision.summary,
          snapshotJson: translateSnapshotIds(revision.snapshotJson, refOf),
          createdAt: revision.createdAt,
        },
      ];
    })
    .sort((a, b) =>
      a.entityType !== b.entityType
        ? a.entityType.localeCompare(b.entityType)
        : a.entity !== b.entity
          ? a.entity.localeCompare(b.entity, "en", { numeric: true })
          : a.revisionNumber - b.revisionNumber,
    );
}

/**
 * Os nós em ordem de árvore: cada pai, e logo depois os filhos dele, por `sortKey`.
 *
 * A ordem do banco (`sortKey` sozinho) empata entre irmãos de pais diferentes — o primeiro filho
 * de cada capítulo é `a0` —, e o empate sairia numa ordem diferente em cada banco. As refs são
 * cunhadas nesta ordem, então ela precisa ser a mesma no banco de origem e no restaurado, ou
 * dois exports do mesmo acervo deixam de ser comparáveis.
 */
export function inTreeOrder<T extends { readonly id: string; readonly parentId: string | null; readonly sortKey: string }>(
  nodes: readonly T[],
): readonly T[] {
  const ids = new Set(nodes.map((node) => node.id));
  const children = new Map<string | null, T[]>();
  for (const node of nodes) {
    // Pai fora da lista (dado inconsistente) vira raiz: perder o nó seria pior que achatá-lo.
    const parent = node.parentId !== null && ids.has(node.parentId) ? node.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), node]);
  }
  for (const list of children.values()) {
    list.sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0));
  }

  const ordered: T[] = [];
  const visit = (parent: string | null) => {
    for (const node of children.get(parent) ?? []) {
      ordered.push(node);
      visit(node.id);
    }
  };
  visit(null);
  return ordered;
}

/** Ordenados por hash e tipo: o banco não garante ordem, e o arquivo precisa sair igual. */
export const sortAssets = (assets: readonly PortableAsset[]): readonly PortableAsset[] =>
  [...assets].sort((a, b) =>
    a.sha256 === b.sha256 ? a.kind.localeCompare(b.kind) : a.sha256 < b.sha256 ? -1 : 1,
  );

function toPublication(publication: RuntimePublication, mint: RefMinter): PortablePublication {
  // O mapa de id → ref é por publicação: `parentRef` só faz sentido dentro dela, e um nó cujo pai
  // estivesse em outra publicação seria dado corrompido, não um caso a suportar.
  const nodes = inTreeOrder(publication.nodes);
  const refById = new Map<string, string>();
  for (const node of nodes) refById.set(node.id, mint.next("node", node.id));

  return {
    ref: mint.next("pub", publication.id),
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
    assets: sortAssets(publication.assets),
    coverAsset: publication.coverAssetSha256,
    sourcePdfAsset: publication.sourcePdfAssetSha256,
    nodes: nodes.map((node) => toNode(node, refById, mint)),
  };
}

function toNode(node: RuntimeNode, refById: Map<string, string>, mint: RefMinter): PortableNode {
  return {
    ref: refById.get(node.id) as string,
    parentRef: node.parentId === null ? null : (refById.get(node.parentId) ?? null),
    kind: node.kind,
    title: node.title,
    slug: node.slug,
    sortKey: node.sortKey,
    numberingStyle: node.numberingStyle,
    originalLabel: node.originalLabel,
    legacyId: node.legacyId,
    deletedAt: node.deletedAt,
    question: node.question === null ? null : toQuestion(node.question, mint),
    bodyLatex: node.bodyLatex,
    anchors: node.anchors.map((anchor) => ({
      asset: anchor.sha256,
      cropAsset: anchor.cropSha256,
      pageNumber: anchor.pageNumber,
      box: anchor.box,
      rotation: anchor.rotation,
      role: anchor.role,
      sourceText: anchor.sourceText,
      extractionMethod: anchor.extractionMethod,
      extractionModel: anchor.extractionModel,
      metadataJson: anchor.metadataJson,
    })),
  };
}

function toQuestion(question: RuntimeQuestion, mint: RefMinter): PortableQuestion {
  return {
    ref: mint.next("q", question.id),
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
    tags: [...question.tags].sort((a, b) => a.localeCompare(b, "pt-BR")),
    options: question.options.map((option) => toOption(option, mint)),
    // Por hash, e ordenados: o mesmo asset em duas questões aponta para o mesmo arquivo.
    assets: sortAssets(question.assets),
  };
}

function toOption(option: RuntimeOption, mint: RefMinter): PortableOption {
  return {
    ref: mint.next("o", option.id),
    sortKey: option.sortKey,
    statementLatex: option.statementLatex,
    solutionLatex: option.solutionLatex,
    originalLatex: option.originalLatex,
    isCorrect: option.isCorrect,
    weight: option.weight,
    legacyId: option.legacyId,
    legacyMarcacao: option.legacyMarcacao,
  };
}
