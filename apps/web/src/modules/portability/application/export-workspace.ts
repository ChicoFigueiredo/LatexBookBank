import type {
  PortableNode,
  PortableOption,
  PortablePublication,
  PortableQuestion,
  PortableWorkspace,
} from "../domain/portable-schema";

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
  readonly tags: readonly { readonly name: string; readonly kind: string }[];
  readonly publications: readonly RuntimePublication[];
}

export interface RuntimePublication {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly publisher: string | null;
  readonly legacyId: number | null;
  readonly legacyUuid: string | null;
  readonly metadataJson: string | null;
  readonly coverAssetSha256: string | null;
  readonly nodes: readonly RuntimeNode[];
}

export interface RuntimeNode {
  readonly id: string;
  readonly parentId: string | null;
  readonly kind: string;
  readonly title: string | null;
  readonly sortKey: string;
  readonly numberingStyle: string;
  readonly originalLabel: string | null;
  readonly legacyId: number | null;
  readonly question: RuntimeQuestion | null;
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
  readonly assetSha256: readonly string[];
}

export interface RuntimeOption {
  readonly id: string;
  readonly sortKey: string;
  readonly statementLatex: string;
  readonly solutionLatex: string;
  readonly isCorrect: boolean;
  readonly weight: number | null;
  readonly legacyId: number | null;
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

  next(prefix: string): string {
    const value = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, value);
    return `${prefix}-${value}`;
  }
}

export function toPortable(runtime: RuntimeWorkspace): PortableWorkspace {
  const mint = new RefMinter();

  return {
    name: runtime.name,
    slug: runtime.slug,
    // Ordenadas: duas exportações do mesmo workspace precisam sair iguais, e a ordem em que o
    // banco devolve tags não é garantida.
    tags: [...runtime.tags].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    publications: runtime.publications.map((publication) => toPublication(publication, mint)),
  };
}

function toPublication(publication: RuntimePublication, mint: RefMinter): PortablePublication {
  // O mapa de id → ref é por publicação: `parentRef` só faz sentido dentro dela, e um nó cujo pai
  // estivesse em outra publicação seria dado corrompido, não um caso a suportar.
  const refById = new Map<string, string>();
  for (const node of publication.nodes) refById.set(node.id, mint.next("node"));

  return {
    ref: mint.next("pub"),
    title: publication.title,
    subtitle: publication.subtitle,
    publisher: publication.publisher,
    legacyId: publication.legacyId,
    legacyUuid: publication.legacyUuid,
    metadataJson: publication.metadataJson,
    coverAsset: publication.coverAssetSha256,
    nodes: publication.nodes.map((node) => toNode(node, refById, mint)),
  };
}

function toNode(node: RuntimeNode, refById: Map<string, string>, mint: RefMinter): PortableNode {
  return {
    ref: refById.get(node.id) as string,
    parentRef: node.parentId === null ? null : (refById.get(node.parentId) ?? null),
    kind: node.kind,
    title: node.title,
    sortKey: node.sortKey,
    numberingStyle: node.numberingStyle,
    originalLabel: node.originalLabel,
    legacyId: node.legacyId,
    question: node.question === null ? null : toQuestion(node.question, mint),
  };
}

function toQuestion(question: RuntimeQuestion, mint: RefMinter): PortableQuestion {
  return {
    ref: mint.next("q"),
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
    assets: [...question.assetSha256].sort(),
  };
}

function toOption(option: RuntimeOption, mint: RefMinter): PortableOption {
  return {
    ref: mint.next("o"),
    sortKey: option.sortKey,
    statementLatex: option.statementLatex,
    solutionLatex: option.solutionLatex,
    isCorrect: option.isCorrect,
    weight: option.weight,
    legacyId: option.legacyId,
  };
}
