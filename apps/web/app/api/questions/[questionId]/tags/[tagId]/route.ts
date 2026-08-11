import { untagQuestion } from "@modules/questions/application/tag-question";
import { PrismaTagRepository } from "@modules/questions/infrastructure/prisma-tag-repository";

import { toErrorResponse } from "../../../../tree-http";

/**
 * Desmarca uma tag da questão.
 *
 * A tag **não** é apagada do workspace: outras questões usam, e "tirei desta" nunca quis dizer
 * "sumir do acervo". Tag sem uso nenhum é lixo barato, e apagá-la aqui destruiria a grafia que
 * alguém escolheu.
 *
 * Ver spec §33 · issue #141.
 */
export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ questionId: string; tagId: string }> },
) {
  const { questionId, tagId } = await params;

  try {
    await untagQuestion(new PrismaTagRepository(), questionId, tagId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
