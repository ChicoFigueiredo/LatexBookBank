/**
 * As quatro fronteiras primárias de infraestrutura (D23).
 *
 * São os pontos onde o produto toca o mundo:
 *
 * | Fronteira | Implementação inicial | Candidato cloud |
 * |---|---|---|
 * | Persistência | `PrismaSqliteRepository` | `PrismaPostgresRepository` (Neon) |
 * | Storage | `LocalFileStorageProvider` | `VercelBlobStorageProvider` · `S3StorageProvider` |
 * | Render | `RenderWorkerExecutor` → Docker `28900` | mesma imagem, outro `baseURL` |
 * | IA | `OpenAiCompatibleProvider` | mesmo provider, outro `baseURL` |
 *
 * **"Primárias" não quer dizer "as únicas".** Outros contratos — `QuestionTypePlugin`,
 * `MathRecognitionProvider`, `QuestionSearchService`, `PortableArchive` — são legítimos quando
 * representam comportamento real. Antes de criar qualquer interface, a pergunta de controle:
 *
 * > Existe mais de uma implementação real, ou uma fronteira arquitetural importante?
 *
 * Se não, provavelmente não precisa de interface.
 *
 * O critério de sucesso arquitetural (1ª auditoria §47) é este código não saber onde executa:
 *
 * ```ts
 * const publication = await publicationRepository.get(id);
 * const asset       = await storageProvider.get(assetId);
 * const result      = await renderExecutor.render(bundle);
 * ```
 */

export { ConcurrencyConflictError } from "./repository";

export type {
  PutAssetInput,
  StorageKey,
  StorageProvider,
  StoredAsset,
  StoredContent,
} from "./storage-provider";
export { AssetNotFoundError, asStorageKey, StorageKeyEscapeError } from "./storage-provider";

export type {
  RenderArtifactDescriptor,
  RenderBundle,
  RenderDiagnostic,
  RenderExecutor,
  RenderHealth,
  RenderJobStatus,
  RenderOptions,
  RenderOutcome,
  RenderProfile,
  RenderResult,
} from "./render-executor";
export { RendererUnavailableError } from "./render-executor";

export type {
  AgentEvent,
  AgentRequest,
  AgentResult,
  AiMessage,
  AiModel,
  AiModelCapabilities,
  AiProvider,
  AiToolCall,
  AiToolDefinition,
  AiToolResult,
  AiUsage,
} from "./ai-provider";
export { AiCredentialMissingError, AiProviderError } from "./ai-provider";

export type {
  MathRecognitionProvider,
  MathRecognitionRequest,
  MathRecognitionResult,
  RecognitionState,
} from "./math-recognition";
export { MathRecognitionError, RECOGNITION_STATES } from "./math-recognition";
