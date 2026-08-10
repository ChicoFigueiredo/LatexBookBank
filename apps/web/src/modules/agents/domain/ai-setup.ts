/**
 * O que a tela sabe sobre a IA configurada.
 *
 * Vive no domínio porque atravessa a fronteira servidor→cliente, e o que atravessa não pode
 * morar num módulo `server-only`. São três valores, todos exibíveis — **nenhum deles é segredo**.
 * Quem os resolve é `application/describe-ai-setup.ts`, do lado de lá.
 *
 * Ver spec §14.6 · issue #93.
 */
export interface AiSetupDescription {
  readonly providerLabel: string;
  readonly model: string | null;
  /** Se o painel pode oferecer ações que dependem de tool calling. */
  readonly toolCalling: boolean;
}
