/**
 * O contrato entre a aplicação e o worker de render (D35).
 *
 * Este pacote é a **única** coisa que os dois lados compartilham. Ele não importa nada: nem
 * Prisma, nem storage, nem SDK de nuvem, nem sequer um utilitário do app. A ausência de
 * dependências não é economia — é a forma de garantir que o worker não possa alcançar o domínio
 * por um caminho transitivo, e há teste de fronteira afirmando isso.
 */

export type { RenderAsset, RenderBundle, RenderOptions, RenderProfile } from "./render-bundle.ts";
export { DEFAULT_RENDER_OPTIONS } from "./render-bundle.ts";

export type {
  RenderArtifactDescriptor,
  RenderDiagnostic,
  RenderHealth,
  RenderJobState,
  RenderJobStatus,
  RenderResult,
} from "./render-result.ts";

export {
  InvalidBundleError,
  MAX_ASSETS,
  MAX_ASSET_BYTES,
  MAX_SOURCE_BYTES,
  MAX_TIMEOUT_MS,
  isSafeAssetName,
  requestsShellEscape,
  validateRenderBundle,
} from "./validate-bundle.ts";
