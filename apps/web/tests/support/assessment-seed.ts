/**
 * Uma biblioteca com um livro e questões de verdade, para os testes das rotas de avaliação.
 * Chamar **depois** de `createTempDatabase()`: o cliente Prisma lê `DATABASE_URL` ao ser importado.
 *
 * O montar é direto no banco porque é cenário, não o que se testa; o que se afirma passa pelas
 * rotas.
 */

export interface SeedOption {
  readonly text: string;
  readonly correct?: boolean;
}

export interface SeedQuestion {
  readonly type: string;
  readonly statement: string;
  readonly options?: readonly SeedOption[];
}

export async function seedLibrary(slug: string) {
  const { prisma } = await import("@infrastructure/database/sqlite/client");
  const { generateNKeysBetween } = await import("@/shared/ordering/fractional-index");

  const workspace = await prisma.workspace.create({ data: { name: slug, slug } });
  const publication = await prisma.publication.create({
    data: { workspaceId: workspace.id, title: `Livro de ${slug}` },
  });

  let last: string | null = null;

  async function question(input: SeedQuestion): Promise<{ questionId: string; nodeId: string }> {
    const options = input.options ?? [];
    const keys = options.length === 0 ? [] : generateNKeysBetween(null, null, options.length);

    const created = await prisma.question.create({
      data: {
        type: input.type,
        statementLatex: input.statement,
        options: {
          create: options.map((option, index) => ({
            sortKey: keys[index] ?? "a0",
            statementLatex: option.text,
            isCorrect: option.correct === true,
          })),
        },
      },
      select: { id: true },
    });

    const [sortKey] = generateNKeysBetween(last, null, 1);
    last = sortKey ?? null;
    const node = await prisma.documentNode.create({
      data: {
        publicationId: publication.id,
        kind: "QUESTION",
        sortKey: sortKey ?? "a0",
        questionId: created.id,
      },
      select: { id: true },
    });

    return { questionId: created.id, nodeId: node.id };
  }

  return { prisma, workspace, publication, question };
}

/** O `params` das rotas dinâmicas do App Router, que chega como Promise. */
export const paramsOf = <T extends Record<string, string>>(value: T) => ({
  params: Promise.resolve(value),
});

export const jsonRequest = (method: string, body?: unknown) =>
  new Request("http://localhost/api", {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
