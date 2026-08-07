import { PrismaLibSql } from "@prisma/adapter-libsql";

import { PrismaClient } from "../src/generated/prisma/client.ts";

// O Bun carrega `.env` e `.env.local` sozinho, então não há nada a fazer aqui.

const url = process.env["DATABASE_URL"];
if (!url) throw new Error("DATABASE_URL ausente. Rode `bun run setup`.");

const prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) });

/**
 * Seed de demonstração.
 *
 * Reproduz em miniatura a forma do acervo real: uma biblioteca vira Workspace (D11), a árvore
 * tem capítulo → seção → questões, e as alternativas carregam `legacyMarcacao` sem que a letra
 * seja identidade — o gabarito está em `isCorrect`.
 *
 * Os `sortKey` são fracionários desde já: reordenar não pode exigir reescrever irmãos.
 */
async function main(): Promise<void> {
  // Idempotente por escolha: o `setup` roda o seed toda vez, e um segundo `create` duplicaria
  // a publicação demo em silêncio — o tipo de ruído que faz alguém desconfiar do próprio banco.
  const existing = await prisma.publication.findFirst({ where: { nickname: "MatFin" } });
  if (existing) {
    console.log("Seed já aplicado; nada a fazer.");
    return;
  }

  const workspace = await prisma.workspace.upsert({
    where: { slug: "demo" },
    update: {},
    create: { name: "Biblioteca de demonstração", slug: "demo" },
  });

  const publication = await prisma.publication.create({
    data: {
      workspaceId: workspace.id,
      title: "Matemática Financeira",
      nickname: "MatFin",
      publisher: "Demonstração",
    },
  });

  const chapter = await prisma.documentNode.create({
    data: {
      publicationId: publication.id,
      kind: "CHAPTER",
      title: "Juros Simples",
      sortKey: "a0",
      numberingStyle: "ARABIC",
      originalLabel: "I",
    },
  });

  const section = await prisma.documentNode.create({
    data: {
      publicationId: publication.id,
      parentId: chapter.id,
      kind: "SECTION",
      title: "Conceitos iniciais",
      sortKey: "a0",
    },
  });

  const multipleChoice = await prisma.question.create({
    data: {
      type: "MULTIPLE_CHOICE",
      statementLatex:
        "Um capital de \\SI{1000}{\\real} é aplicado a juros simples de \\SI{2}{\\percent} ao " +
        "mês. Qual o montante após 6 meses?",
      solutionLatex: "$M = C(1 + i \\cdot t) = 1000(1 + 0{,}02 \\cdot 6) = 1120$",
      difficulty: 2,
      year: 2014,
      board: "Cesgranrio",
      institution: "Petrobras",
      status: "READY",
      options: {
        create: [
          { sortKey: "a0", statementLatex: "\\SI{1020}{\\real}", legacyMarcacao: "a" },
          { sortKey: "a1", statementLatex: "\\SI{1060}{\\real}", legacyMarcacao: "b" },
          {
            sortKey: "a2",
            statementLatex: "\\SI{1120}{\\real}",
            isCorrect: true,
            legacyMarcacao: "c",
          },
          { sortKey: "a3", statementLatex: "\\SI{1200}{\\real}", legacyMarcacao: "d" },
          { sortKey: "a4", statementLatex: "\\SI{1260}{\\real}", legacyMarcacao: "e" },
        ],
      },
    },
  });

  const discursive = await prisma.question.create({
    data: {
      type: "DISCURSIVE",
      statementLatex: "Demonstre que, em juros simples, o montante cresce linearmente com o tempo.",
      solutionLatex: "$M(t) = C + C \\cdot i \\cdot t$, afim em $t$ com coeficiente $C \\cdot i$.",
      difficulty: 7,
    },
  });

  await prisma.documentNode.createMany({
    data: [
      {
        publicationId: publication.id,
        parentId: section.id,
        kind: "QUESTION",
        sortKey: "a0",
        originalLabel: "1",
        questionId: multipleChoice.id,
      },
      {
        publicationId: publication.id,
        parentId: section.id,
        kind: "QUESTION",
        sortKey: "a1",
        originalLabel: "2",
        questionId: discursive.id,
      },
    ],
  });

  const tag = await prisma.tag.upsert({
    where: { workspaceId_name: { workspaceId: workspace.id, name: "juros simples" } },
    update: {},
    create: { workspaceId: workspace.id, name: "juros simples", kind: "TOPIC" },
  });

  await prisma.questionTag.createMany({
    data: [
      { questionId: multipleChoice.id, tagId: tag.id },
      { questionId: discursive.id, tagId: tag.id },
    ],
  });

  const counts = {
    workspaces: await prisma.workspace.count(),
    publications: await prisma.publication.count(),
    nodes: await prisma.documentNode.count(),
    questions: await prisma.question.count(),
    options: await prisma.questionOption.count(),
  };

  console.log("Seed aplicado:", counts);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
