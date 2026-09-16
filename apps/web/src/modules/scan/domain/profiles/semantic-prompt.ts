import type { SemanticPromptInput } from "../capture-profile";

/**
 * O pedido de desempate à IA, em forma compacta e estruturada (§26 e §27 do prompt 03).
 *
 * O modelo não lê o livro: recebe a estrutura já montada em volta, os candidatos duvidosos e os
 * tipos permitidos, e devolve JSON que o caso de uso valida antes de tocar a proposta. Nunca
 * texto livre no banco.
 */
export function semanticPrompt(input: SemanticPromptInput, guidance: string): string {
  const context = {
    profile: input.profile,
    previous_structure: input.previousStructure.slice(-12),
    allowed_kinds: input.allowedKinds,
    candidates: input.candidates.map((candidate) => ({
      key: candidate.key,
      proposed_kind: candidate.kind,
      confidence: candidate.confidence,
      reasons: candidate.reasons,
      text: candidate.text.slice(0, 600),
    })),
  };

  return [
    "Você revisa a estrutura editorial proposta por um scanner determinístico de PDF.",
    guidance,
    "Para cada candidato, decida o tipo correto entre `allowed_kinds` e dê uma confiança de 0 a 1.",
    "Não invente candidatos, não reescreva o texto, não resuma.",
    'Responda somente com JSON: {"decisions":[{"key":"…","kind":"…","confidence":0.0,"reason":"…"}]}',
    "",
    JSON.stringify(context),
  ].join("\n");
}
