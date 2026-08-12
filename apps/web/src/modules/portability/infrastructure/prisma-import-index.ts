import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";
import {
  normalizeIsbn,
  type ExistingIndex,
  type ImportCollision,
} from "@modules/portability/application/import-workspace";
import type { ConflitoDeImportacao } from "@modules/portability/domain/import-conflicts";
import type { PortableWorkspace } from "@modules/portability/domain/portable-schema";

/**
 * O índice do **destino** — a metade que faltava para o dry-run dizer alguma coisa.
 *
 * `toRuntime` sabe detectar colisão desde a issue #115, e a rota de import a chamava com o índice
 * default, que é vazio. Consequência: a simulação **sempre** respondia zero conflitos, e a tela
 * dizia isso com todas as letras — o pior tipo de mentira, a que soa como boa notícia. Quem
 * importasse um `.lbb` sobre um acervo que já tem os mesmos livros veria "nenhum conflito" e
 * ficaria com tudo duplicado sem aviso.
 *
 * Nada disso era bug de domínio: a regra estava escrita, testada e correta. Faltava alguém
 * perguntar ao banco o que já existe.
 */

export async function readExistingIndex(): Promise<ExistingIndex> {
  const [publicacoes, questoes] = await Promise.all([
    prisma.publication.findMany({
      // `isbn` entra no OR: livro nascido no app não tem chave legada nenhuma, e era exatamente
      // ele que não colidia com a própria cópia.
      where: {
        OR: [{ legacyId: { not: null } }, { legacyUuid: { not: null } }, { isbn: { not: null } }],
      },
      select: { id: true, legacyId: true, legacyUuid: true, isbn: true },
    }),
    prisma.question.findMany({
      where: { legacyId: { not: null } },
      select: { id: true, legacyId: true },
    }),
  ]);

  const publicationsByLegacyId = new Map<number, string>();
  const publicationsByLegacyUuid = new Map<string, string>();
  const publicationsByIsbn = new Map<string, string>();

  for (const row of publicacoes) {
    if (row.legacyId !== null) publicationsByLegacyId.set(row.legacyId, row.id);
    if (row.legacyUuid !== null) publicationsByLegacyUuid.set(row.legacyUuid, row.id);

    const isbn = normalizeIsbn(row.isbn);
    if (isbn !== null) publicationsByIsbn.set(isbn, row.id);
  }

  const questionsByLegacyId = new Map<number, string>();
  for (const row of questoes) {
    if (row.legacyId !== null) questionsByLegacyId.set(row.legacyId, row.id);
  }

  return {
    publicationsByLegacyId,
    publicationsByLegacyUuid,
    publicationsByIsbn,
    questionsByLegacyId,
  };
}

/**
 * Enriquece a colisão até virar a frase do protótipo.
 *
 * O domínio devolve `{kind, by, value, existingId}` — o suficiente para decidir, e nada para ler.
 * O nome do livro e as duas contagens moram no banco e no arquivo, e é aqui que se juntam.
 *
 * As colisões já chegam deduplicadas por item: uma consulta por conflito, e o número de conflitos
 * é da ordem de unidades — não vale o `groupBy` que a estante precisou.
 */
export async function describeConflicts(
  colisoes: readonly ImportCollision[],
  portable: PortableWorkspace,
): Promise<readonly ConflitoDeImportacao[]> {
  if (colisoes.length === 0) return [];

  const publicationIds = colisoes.filter((c) => c.kind === "publication").map((c) => c.existingId);
  const questionIds = colisoes.filter((c) => c.kind === "question").map((c) => c.existingId);

  const [publicacoes, contagens, questoes] = await Promise.all([
    prisma.publication.findMany({
      where: { id: { in: publicationIds } },
      select: { id: true, title: true, nickname: true, legacyId: true, legacyUuid: true },
    }),
    publicationIds.length === 0
      ? []
      : prisma.documentNode.groupBy({
          by: ["publicationId"],
          where: { publicationId: { in: publicationIds }, deletedAt: null, questionId: { not: null } },
          _count: { _all: true },
        }),
    prisma.question.findMany({
      where: { id: { in: questionIds } },
      select: { id: true, nickname: true, legacyId: true },
    }),
  ]);

  const porId = new Map(publicacoes.map((row) => [row.id, row]));
  const questaoPorId = new Map(questoes.map((row) => [row.id, row]));
  const contagemPorId = new Map(contagens.map((row) => [row.publicationId, row._count._all]));

  // Quantas questões o **arquivo** traz para cada publicação — a outra metade da comparação.
  const noArquivo = new Map<string, number>();
  for (const publicacao of portable.publications) {
    const quantas = publicacao.nodes.filter((node) => node.question !== null).length;
    if (publicacao.legacyId !== null) noArquivo.set(`id:${publicacao.legacyId}`, quantas);
    if (publicacao.legacyUuid !== null) noArquivo.set(`uuid:${publicacao.legacyUuid}`, quantas);

    const isbn = normalizeIsbn(publicacao.isbn);
    if (isbn !== null) noArquivo.set(`isbn:${isbn}`, quantas);
  }

  return colisoes.map((colisao): ConflitoDeImportacao => {
    if (colisao.kind === "question") {
      const questao = questaoPorId.get(colisao.existingId);

      return {
        kind: "question",
        title: questao?.nickname ?? `Questão ${colisao.value}`,
        existingQuestions: null,
        incomingQuestions: null,
        existingId: colisao.existingId,
      };
    }

    const publicacao = porId.get(colisao.existingId);
    // A chave da comparação é a **mesma** por onde a colisão foi detectada: um livro que casou por
    // ISBN pode não ter chave legada nenhuma, e procurar por `uuid:` daria contagem vazia.
    const chave =
      colisao.by === "isbn"
        ? `isbn:${colisao.value}`
        : publicacao?.legacyId !== null && publicacao?.legacyId !== undefined
          ? `id:${publicacao.legacyId}`
          : `uuid:${publicacao?.legacyUuid ?? ""}`;

    return {
      kind: "publication",
      // O apelido primeiro: “FME 1” é como o protótipo escreve a frase, e é como o livro é
      // chamado. O título da capa entra quando não há apelido.
      title: publicacao?.nickname ?? publicacao?.title ?? "Livro",
      existingQuestions: contagemPorId.get(colisao.existingId) ?? 0,
      incomingQuestions: noArquivo.get(chave) ?? null,
      existingId: colisao.existingId,
    };
  });
}
