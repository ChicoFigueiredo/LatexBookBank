import type { PrismaClient } from "@/generated/prisma/client";
import type { ImportPlan } from "@modules/portability/application/import-workspace";

/**
 * Grava um `ImportPlan` do legado — numa transação, e nunca por cima. Mesma lógica de
 * `writeImportedWorkspace` (portability), sem a parte de assets: o mapeador do legado ainda não
 * produz nenhum (checklist Fase 11, bloco "Assets", em aberto).
 *
 * O cliente vem pelo construtor, e não do módulo `server-only`: o importador é um script de linha
 * de comando (`dry-run-legacy-import.ts` / `write-legacy-import.ts`), e importar aquele módulo
 * faria o `server-only` abortar antes da primeira linha — mesmo motivo de
 * `PrismaLatexKnowledgeRepository`.
 *
 * Ver checklist Fase 11, bloco "Execução" · issue #111.
 */

export interface LegacyImportReport {
  readonly workspaceId: string;
  readonly publications: number;
  readonly nodes: number;
  readonly questions: number;
  readonly options: number;
}

export interface LegacyWorkspaceIdentity {
  /** `IdBiblio` de `padrao.knowchicoconfig` — único de verdade entre as bibliotecas. */
  readonly legacyId: number;
  /** Caminho local do `.knowchico`, só para auditoria. */
  readonly legacySourcePath: string;
}

export class PrismaLegacyImportWriter {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * `null` se esta biblioteca (por `IdBiblio`) já tem workspace — a idempotência real do import
   * é aqui, não em colidir questão por questão. Cada biblioteca é uma numeração `IdQuestao`
   * própria, reiniciada em 1; duas bibliotecas diferentes colidirem por acidente nesse número foi
   * exatamente o bug que apareceu ao importar a segunda leva (2026-08-31) — o índice de colisão
   * do `.lbb` (`ExistingIndex`) não tem escopo de workspace, e não devia ser usado aqui.
   */
  async findExistingWorkspaceId(legacyId: number): Promise<string | null> {
    const found = await this.prisma.workspace.findUnique({
      where: { legacyId },
      select: { id: true },
    });
    return found?.id ?? null;
  }

  async write(plan: ImportPlan, identity: LegacyWorkspaceIdentity): Promise<LegacyImportReport> {
    return this.prisma.$transaction(async (client) => {
      const workspace = await client.workspace.create({
        data: {
          name: plan.workspace.name,
          slug: plan.workspace.slug,
          legacyId: identity.legacyId,
          legacySourcePath: identity.legacySourcePath,
        },
        select: { id: true },
      });

      let nodes = 0;
      let questions = 0;
      let options = 0;

      for (const publication of plan.workspace.publications) {
        const createdPublication = await client.publication.create({
          data: {
            workspaceId: workspace.id,
            title: publication.title,
            subtitle: publication.subtitle,
            publisher: publication.publisher,
            nickname: publication.nickname,
            isbn: publication.isbn,
            otherIdentifier: publication.otherIdentifier,
            edition: publication.edition,
            editionYear: publication.editionYear,
            language: publication.language,
            series: publication.series,
            volume: publication.volume,
            notes: publication.notes,
            legacyId: publication.legacyId,
            legacyUuid: publication.legacyUuid,
            metadataJson: publication.metadataJson,
            importedAt: new Date(),
          },
          select: { id: true },
        });

        // Autores renascem por nome — `Author` é compartilhado, e o id de origem não significa
        // nada aqui (ver `writeImportedWorkspace`, mesma decisão).
        for (const [posicao, nome] of publication.authors.entries()) {
          const autor = await client.author.upsert({
            where: { name: nome },
            create: { name: nome },
            update: {},
            select: { id: true },
          });

          await client.publicationAuthor.create({
            data: { publicationId: createdPublication.id, authorId: autor.id, position: posicao },
          });
        }

        // Duas passadas: os nós nascem sem pai, o `parentId` é ligado depois. Uma passada só
        // exigiria que o pai viesse antes do filho no arquivo.
        const nodeIdByRef = new Map<string, string>();

        for (const node of publication.nodes) {
          let questionId: string | null = null;

          if (node.question !== null) {
            const question = node.question;

            const createdQuestion = await client.question.create({
              data: {
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
              },
              select: { id: true },
            });

            questionId = createdQuestion.id;
            questions += 1;

            for (const option of question.options) {
              await client.questionOption.create({
                data: {
                  questionId: createdQuestion.id,
                  sortKey: option.sortKey,
                  statementLatex: option.statementLatex,
                  solutionLatex: option.solutionLatex,
                  originalLatex: option.originalLatex,
                  isCorrect: option.isCorrect,
                  weight: option.weight,
                  legacyId: option.legacyId,
                  legacyMarcacao: option.legacyMarcacao,
                },
              });
              options += 1;
            }
          }

          const createdNode = await client.documentNode.create({
            data: {
              publicationId: createdPublication.id,
              kind: node.kind,
              title: node.title,
              sortKey: node.sortKey,
              numberingStyle: node.numberingStyle,
              originalLabel: node.originalLabel,
              legacyId: node.legacyId,
              questionId,
            },
            select: { id: true },
          });

          nodeIdByRef.set(node.id, createdNode.id);
          nodes += 1;
        }

        for (const node of publication.nodes) {
          if (node.parentId === null) continue;

          const id = nodeIdByRef.get(node.id);
          const parentId = nodeIdByRef.get(node.parentId);
          if (id === undefined || parentId === undefined) continue;

          await client.documentNode.update({ where: { id }, data: { parentId } });
        }
      }

      return {
        workspaceId: workspace.id,
        publications: plan.workspace.publications.length,
        nodes,
        questions,
        options,
      };
    });
  }
}
