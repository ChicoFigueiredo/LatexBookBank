import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";
import type { CaptureFacts } from "@modules/recognition/domain/capture-queue";

/**
 * Os recortes de uma publicação, como a fila os vê.
 *
 * Uma consulta sobre `SourceAnchor` — a fila **é** essa pergunta, e não uma tabela paralela.
 * `questions` entra só para saber se já virou questão; `_count` seria mais barato, mas contagem
 * filtrada de relação depende de flag de preview do Prisma.
 */
export async function readCaptureFacts(publicationId: string): Promise<readonly CaptureFacts[]> {
  const rows = await prisma.sourceAnchor.findMany({
    where: { publicationId },
    orderBy: { createdAt: "desc" },
    // Um teto: uma publicação com mil recortes pendentes é um problema de trabalho acumulado, não
    // de tela — e carregar mil linhas para desenhar uma fila que ninguém rola até o fim seria
    // pagar por dado descartado.
    take: 200,
    select: {
      id: true,
      cropAssetId: true,
      pageNumber: true,
      createdAt: true,
      sourceText: true,
      extractionMethod: true,
      extractionModel: true,
      questions: { select: { id: true }, take: 1 },
      nodes: { select: { id: true }, take: 1 },
    },
  });

  return rows.map((row) => ({
    anchorId: row.id,
    cropAssetId: row.cropAssetId,
    pageNumber: row.pageNumber,
    createdAt: row.createdAt,
    recognizedText: row.sourceText,
    extractionMethod: row.extractionMethod,
    extractionModel: row.extractionModel,
    // Questão **ou** nó: uma captura aprovada liga a âncora aos dois, e uma inserção em questão
    // existente liga só a um. Os dois casos são "isto já foi usado".
    hasQuestion: row.questions.length > 0 || row.nodes.length > 0,
  }));
}

/**
 * Registra o resultado do reconhecimento na âncora, assim que ele acontece.
 *
 * É o que faz o trabalho sobreviver ao recarregamento (§26, §53): sem isto, reconhecer dez
 * recortes e fechar a aba perderia as dez transcrições, e o recorte voltaria para "aguardando"
 * como se nada tivesse rodado.
 *
 * Gravar aqui **não** aprova nada: a questão só nasce por `createQuestionFromRecognition`, que
 * exige o gesto humano. O que fica guardado é a proposta.
 */
export async function recordRecognition(
  anchorId: string,
  input: {
    readonly latex: string;
    readonly method: string;
    readonly model: string | null;
    readonly metadataJson: string;
  },
): Promise<boolean> {
  const { count } = await prisma.sourceAnchor.updateMany({
    where: { id: anchorId },
    data: {
      sourceText: input.latex.slice(0, 20_000),
      extractionMethod: input.method,
      extractionModel: input.model,
      metadataJson: input.metadataJson,
    },
  });

  return count > 0;
}

/**
 * Descarta um recorte da fila.
 *
 * Apaga a âncora **e** o crop: um recorte que o usuário rejeitou não é patrimônio — é uma seleção
 * errada na página. A regra da D29 protege a **fonte** (o PDF, a imagem), que continua intacta:
 * recortar de novo é sempre possível.
 *
 * Recusa quando a âncora já virou questão. Ali o recorte é a origem de um dado do acervo, e apagá-
 * lo deixaria a questão sem poder responder de onde veio.
 */
export async function discardCapture(anchorId: string): Promise<"discarded" | "in-use" | "absent"> {
  const anchor = await prisma.sourceAnchor.findUnique({
    where: { id: anchorId },
    select: { cropAssetId: true, questions: { select: { id: true }, take: 1 }, nodes: { select: { id: true }, take: 1 } },
  });

  if (anchor === null) return "absent";
  if (anchor.questions.length > 0 || anchor.nodes.length > 0) return "in-use";

  await prisma.$transaction(async (tx) => {
    await tx.sourceAnchor.delete({ where: { id: anchorId } });

    // O `Asset` do crop sai junto, e só ele. O `sourceAssetId` — o PDF ou a imagem de origem —
    // fica: ele é a fonte, e outras âncoras apontam para ela.
    if (anchor.cropAssetId !== null) {
      await tx.asset.deleteMany({ where: { id: anchor.cropAssetId, kind: "CROP" } });
    }
  });

  return "discarded";
}
