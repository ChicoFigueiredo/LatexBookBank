import "server-only";

import { prisma } from "@infrastructure/database/sqlite/client";
import type { RecognitionProvenanceWriter } from "@modules/recognition/application/create-question-from-recognition";
import type { RecognitionRun } from "@modules/recognition/domain/recognition-candidate";

/**
 * Guarda, na âncora, a execução do reconhecedor que originou a versão aprovada.
 *
 * Na `SourceAnchor` e não numa tabela nova: a âncora **é** o registro da origem — arquivo, página,
 * caixa —, e as colunas `extractionMethod`, `extractionModel` e `sourceText` existem desde a Fase 0
 * exatamente para isto. Uma tabela `RecognitionRun` separada seria uma segunda casa para o mesmo
 * fato, com o trabalho de mantê-las de acordo.
 *
 * O que fica registrado é o mínimo da §36 — provider, model, duração, confiança, saída crua — e é
 * o que a §69 pede: pelo menos a execução que originou a versão aprovada. Reprocessar depois
 * escreve por cima, e é o certo: a pergunta que a aba Origem responde é "de onde veio o que está
 * aqui **agora**".
 */
export class PrismaRecognitionProvenance implements RecognitionProvenanceWriter {
  async recordRun(anchorId: string, run: RecognitionRun): Promise<boolean> {
    // `updateMany` e não `update`: âncora inexistente devolve zero em vez de lançar, e quem chama
    // traduz isso num erro com nome — `update` daria um `P2025` cru subindo até a rota.
    const { count } = await prisma.sourceAnchor.updateMany({
      where: { id: anchorId },
      data: {
        extractionMethod: `recognition:${run.providerId}`,
        extractionModel: run.model,
        // O LaTeX **como veio do modelo**, antes da correção humana. É o que permite responder
        // "o modelo errou ou eu digitei errado?" seis meses depois.
        sourceText: run.rawLatex.slice(0, 20_000),
        metadataJson: JSON.stringify({
          mode: run.mode,
          durationMs: run.durationMs,
          confidence: run.confidence,
          recognizedAt: run.recognizedAt,
        }),
      },
    });

    return count > 0;
  }
}
