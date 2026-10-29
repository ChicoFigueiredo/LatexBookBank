import { NextResponse } from "next/server";

import {
  AgentRunOutOfScopeError,
  OptionFromAnotherQuestionError,
  QuestionGoneError,
} from "@modules/agents/application/apply-question-patch";
import { NothingApprovedError } from "@modules/agents/domain/apply-patch";
import { PatchRejectedError } from "@modules/agents/domain/question-patch";
import {
  AssessmentNotFoundError,
  VariantsWouldBeLostError,
} from "@modules/assessments/application/manage-assessments";
import {
  EmptyAssessmentError,
  MissingQuestionError,
  QuestionsInTrashError,
  UnsupportedQuestionTypeError,
} from "@modules/assessments/application/compose-assessment";
import { AnchorEditError } from "@modules/assets/application/edit-node-anchors";
import {
  CropOwnerNotFoundError,
  CropSourceNotFoundError,
} from "@modules/assets/application/save-crop";
import { UploadRejectedError } from "@modules/assets/domain/asset-ingestion";
import { InvalidAnchorError } from "@modules/assets/domain/source-anchor";
import { DeletedAncestorError } from "@modules/document-tree/application/mutate-tree";
import { InvalidSortKeyError } from "@/shared/ordering/fractional-index";
import { InvalidNodeBodyError } from "@modules/document-tree/domain/node-body";
import { CyclicMoveError, NodeNotFoundError } from "@modules/document-tree/domain/tree-mutations";
import {
  ArchiveTooLargeError,
  CorruptArchiveError,
  ExportTooLargeError,
  RetiredFormatVersionError,
  UnknownFormatVersionError,
} from "@modules/portability/domain/portable-schema";
import {
  CatalogPdfMissingError,
  PublicationHasSourceError,
} from "@modules/publications/application/attach-from-catalog";
import {
  CatalogEntryNotFoundError,
  DuplicatePublicationError,
} from "@modules/publications/application/import-from-catalog";
import { PublicationNotFoundError } from "@modules/publications/application/manage-publications";
import {
  InvalidPublicationError,
  PublicationConfirmationMismatchError,
  PublicationInAssessmentsError,
} from "@modules/publications/domain/publication-draft";
import { DestinationNotFoundError } from "@modules/questions/application/create-question";
import type { SaveQuestionConflict } from "@modules/questions/application/question-contract";
import { QuestionNotFoundError as OptionQuestionNotFoundError } from "@modules/questions/application/mutate-options";
import { QuestionNotFoundError } from "@modules/questions/application/save-question";
import {
  InvalidOptionEditError,
  OptionNotFoundError,
} from "@modules/questions/domain/option-mutations";
import { InvalidQuestionTypeError } from "@modules/questions/domain/question-blueprint";
import { MetadataError } from "@modules/questions/domain/question-metadata";
import { InvalidTagError } from "@modules/questions/domain/tag";
import { RecognitionProvenanceError } from "@modules/recognition/application/create-question-from-recognition";
import { VisionNotConfiguredError } from "@modules/recognition/application/recognize-crop";
import {
  CaptureInUseError,
  CaptureNotFoundError,
} from "@modules/recognition/application/discard-capture";
import {
  CandidateNotReviewedError,
  EmptyCandidateError,
} from "@modules/recognition/domain/recognition-candidate";
import { ArtifactEvictedError } from "@modules/rendering/domain/artifact-evicted";
import { RenderArtifactNotFoundError } from "@modules/rendering/domain/render-artifact-not-found";
import { RendererNotConfiguredError } from "@modules/rendering/domain/renderer-not-configured";
import {
  ApprovalConflictError,
  DestinationNotInPublicationError,
} from "@modules/scan/application/approve-scan";
import { ScanRunNotFoundError, ScanRunStateError } from "@modules/scan/application/control-scan";
import { NoSourcePdfError, UnknownCaptureProfileError } from "@modules/scan/application/start-scan";
import { InvalidReviewError } from "@modules/scan/domain/review";
import { InvalidScanSettingsError } from "@modules/scan/domain/scan-run";
import {
  DuplicateLibraryError,
  InvalidLibraryNameError,
  LibraryConfirmationMismatchError,
  LibraryNotFoundError,
} from "@modules/workspaces/domain/library";
import { QuestionOutOfScopeError } from "@/shared/authorization/question-out-of-scope";
import { PayloadTooLargeError } from "@/shared/http/read-capped-body";
import { logger } from "@/shared/observability/logger";
import {
  AiCredentialMissingError,
  AssetNotFoundError,
  ConcurrencyConflictError,
  MathRecognitionError,
  RendererUnavailableError,
  StorageKeyEscapeError,
} from "@/shared/ports";
import { CatalogFileMissingError, CatalogUnavailableError } from "@/shared/ports/library-catalog";

import { CatalogRootNotAllowedError } from "./catalog/catalog-http";

/**
 * O HTTP de todas as rotas: ler o corpo, recusar o pedido mal formado e traduzir erro em resposta.
 *
 * Era `tree-http.ts`, com nome e dependências da árvore, e ao lado dele havia mais quatro
 * tradutores encadeados (o do scan, o do acervo, o do catálogo, o do render), mais `instanceof`
 * soltos em vinte rotas. Uma rota nova precisava saber qual chamar e em que ordem, e um erro de
 * domínio novo virava 500 nas rotas que não tinham recebido o `instanceof` dele (STE-06, ARQ-11).
 *
 * Validação escrita à mão, sem Zod: a superfície aqui são campos de vocabulário fechado, e Zod
 * fica onde o schema é rico (`QuestionPatch`, o `.lbb`).
 */

export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new BadRequestError("O corpo precisa ser um objeto JSON.");
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof BadRequestError) throw error;
    throw new BadRequestError("Corpo JSON inválido.");
  }
}

/**
 * Um identificador obrigatório: texto não vazio, de até 200 caracteres.
 *
 * Estava copiado em duas rotas do agente, e o texto obrigatório em outras duas — a validação é
 * escrita à mão (ADR 0011), e a que aparece duas vezes mora aqui.
 */
export function requireId(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "" || value.length > 200) {
    throw new BadRequestError(`\`${field}\` é obrigatório e precisa ser um identificador.`);
  }
  return value;
}

/** Um texto obrigatório, de um campo do JSON ou do formulário. */
export function requireText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new BadRequestError(`O campo \`${field}\` é obrigatório.`);
  }
  return value;
}

/** O corpo de erro: o código semântico, a mensagem, e o que a tela precisa além dela. */
type ErrorBody = { readonly error: string; readonly message?: string } & Record<string, unknown>;

interface ErrorRule {
  matches(error: unknown): boolean;
  respond(error: unknown): { readonly status: number; readonly body: ErrorBody };
}

// `never[]` aceita qualquer construtor, inclusive os de erro com parâmetros obrigatórios.
type ErrorClass<E> = abstract new (...args: never[]) => E;

/**
 * Uma linha da tabela: a classe, o status e o corpo.
 *
 * O corpo padrão é `{ error: code, message: error.message }`; `extra` acrescenta campos (a lista
 * de provas, o campo a marcar) e pode trocar a mensagem quando a do domínio não é para a tela.
 */
function on<E extends Error = Error>(
  // Uma lista mistura classes sem campo em comum, e aí o corpo só lê o que todo `Error` tem.
  types: ErrorClass<E> | readonly ErrorClass<Error>[],
  status: number,
  code: string | ((error: E) => string),
  extra: (error: E) => Record<string, unknown> = () => ({}),
): ErrorRule {
  const list: readonly ErrorClass<Error>[] = Array.isArray(types) ? types : [types];
  return {
    matches: (error) => list.some((type) => error instanceof type),
    respond: (error) => {
      const typed = error as E;
      return {
        status,
        body: {
          error: typeof code === "string" ? code : code(typed),
          message: typed.message,
          ...extra(typed),
        },
      };
    },
  };
}

/**
 * A tabela única: erro de domínio → status e código.
 *
 * As convenções que as rotas já seguiam, e que continuam valendo:
 *
 * - **400** é pedido mal formado; a correção é do lado de quem pede.
 * - **409** é pedido certo que o **estado** recusa: seria aceito noutro acervo, noutra árvore,
 *   noutra hora. O cliente trata 400 como "meu código está errado" e 409 como "mostre à pessoa".
 * - **404** sem distinguir "não existe" de "não é seu": a diferença contaria a quem pergunta que
 *   o id acertou.
 * - **422** é o arquivo ou o candidato que chegou e não serve; **503** é o serviço de fora que não
 *   está configurado ou não responde.
 *
 * Os códigos são os que cada rota já devolvia, para as telas que ramificam por eles. Construída na
 * primeira chamada, e não ao carregar o módulo: `catalog-http` importa `BadRequestError` daqui, e
 * uma tabela montada no topo leria a classe dele antes de ela existir.
 */
let table: readonly ErrorRule[] | null = null;

const rules = (): readonly ErrorRule[] =>
  (table ??= [
    on(BadRequestError, 400, "bad_request"),

    // Árvore. Ciclo e ancestral excluído são estado, não pedido mal formado.
    on(NodeNotFoundError, 404, "not_found"),
    on([CyclicMoveError, DeletedAncestorError], 409, "conflict"),
    // Dois irmãos com a mesma chave (#260): o pedido está certo, o que o recusa é a ordem gravada.
    on(InvalidSortKeyError, 409, "conflict", () => ({
      message: "A ordem destes itens está inconsistente. Mova um deles e tente de novo.",
    })),
    on(InvalidNodeBodyError, 400, "bad_request"),
    // O corpo é o contrato do 409 de salvar questão (I8): a tela o lê para comparar as versões.
    on(ConcurrencyConflictError, 409, "conflict", (error): Omit<SaveQuestionConflict, "error"> => ({
      message: CONFLICT_MESSAGES[error.entityType] ?? error.message,
      expectedVersion: String(error.expectedVersion),
      actualVersion: String(error.actualVersion),
    })),

    // Questão e alternativas.
    on(QuestionOutOfScopeError, 404, "not_found"),
    on([QuestionNotFoundError, OptionQuestionNotFoundError, OptionNotFoundError], 404, "not_found"),
    on(InvalidOptionEditError, 400, "bad_request"),
    // Recusa em vez de correção silenciosa: ano `20244` é erro de digitação, e gravar `2024`
    // seria adivinhação — que é como um acervo perde a confiabilidade.
    on(MetadataError, 400, "invalid_metadata", (error) => ({ field: error.field })),
    on(InvalidQuestionTypeError, 400, "invalid_question_type"),
    on(DestinationNotFoundError, 404, "destination_not_found"),
    on(InvalidTagError, 400, "invalid_tag"),

    // Recorte, âncora e arquivo.
    on(InvalidAnchorError, 400, "invalid_anchor"),
    on(AnchorEditError, 400, "bad_request"),
    on(CropSourceNotFoundError, 404, "source_not_found"),
    // O livro ou a questão não existem, ou não são da biblioteca do PDF (#256): a mesma resposta.
    on(CropOwnerNotFoundError, 404, "owner_not_found"),
    on(UploadRejectedError, 415, (error) => `upload_${error.reason}`),
    // Barrada pelo provider — mas um 500 esconderia uma recusa de isolamento num erro genérico,
    // e quem chamou não saberia que o `workspaceId` é que estava errado.
    on(StorageKeyEscapeError, 400, "invalid_workspace", () => ({
      message:
        "`workspaceId` inválido: ele vira segmento de caminho e não pode conter `/` nem `..`.",
    })),
    // Linha no banco sem arquivo no storage: para um derivado é legítimo (D29), e a resposta
    // certa é 404 com a razão. O artefato de render diz o que fazer; o arquivo genérico, não.
    on(ArtifactEvictedError, 404, "artifact_evicted"),
    on(AssetNotFoundError, 404, "asset_evicted", () => ({
      message: "O arquivo não está mais no storage.",
    })),

    // Captura e reconhecimento.
    on(CaptureNotFoundError, 404, "not_found"),
    // O recorte é a origem de uma questão: apagá-lo a deixaria sem poder dizer de onde veio.
    on(CaptureInUseError, 409, "capture_in_use"),
    on(CandidateNotReviewedError, 422, "not_reviewed"),
    on(EmptyCandidateError, 422, "empty_candidate"),
    on(RecognitionProvenanceError, 404, "source_missing"),
    // O provider falhou: o recorte segue guardado, e a mensagem diz o que houve.
    on(MathRecognitionError, 502, "recognition_failed"),
    // Não configurado é diferente de fora do ar: este se resolve editando `.env.local`.
    on(VisionNotConfiguredError, 503, "vision_not_configured"),

    // Agente.
    on(AiCredentialMissingError, 503, "ai_credential_missing"),
    on(NothingApprovedError, 400, "nothing_approved"),
    on(PatchRejectedError, 400, "patch_rejected", (error) => ({ issues: error.issues })),
    on(QuestionGoneError, 409, "question_gone"),
    // A segunda barreira do aplicador: o plano já descarta o id, e chegar aqui é pedido montado à
    // mão. 400 — o que está errado é o patch, não o estado da questão.
    on(OptionFromAnotherQuestionError, 400, "option_from_another_question"),
    // O turno citado no patch não é desta questão (SEC-06): 404, sem dizer se existe noutra.
    on(AgentRunOutOfScopeError, 404, "agent_run_not_found"),

    // Render: 503 e não 500 quando o worker não respondeu — é indisponibilidade, e o texto está salvo.
    on(RendererUnavailableError, 503, "renderer_unavailable"),
    on(RendererNotConfiguredError, 503, "renderer_not_configured"),
    on(RenderArtifactNotFoundError, 404, "not_found"),

    // Avaliações.
    on(AssessmentNotFoundError, 404, "not_found"),
    // O mapa de letras de uma variante é o gabarito de uma prova que pode já ter ido para a sala:
    // 409 com as letras, para a tela dizer o que se perde antes de alguém confirmar.
    on(VariantsWouldBeLostError, 409, "variants_would_be_lost", (error) => ({
      variantLabels: error.variantLabels,
    })),
    on(UnsupportedQuestionTypeError, 409, "unsupported_question_type", (error) => ({
      questionIds: error.questionIds,
    })),
    on(QuestionsInTrashError, 409, "questions_in_trash", (error) => ({
      questionIds: error.questionIds,
    })),
    on([EmptyAssessmentError, MissingQuestionError], 409, "cannot_compose"),

    // Scan. Pedido mal formado é 400; o que depende do estado — o livro sem PDF, a execução que
    // já terminou — é 409, para a tela mostrar a mensagem em vez de tratar como defeito dela.
    on([UnknownCaptureProfileError, InvalidScanSettingsError], 400, "bad_request"),
    on(DestinationNotInPublicationError, 400, "bad_request"),
    on(ScanRunNotFoundError, 404, "not_found"),
    on(NoSourcePdfError, 409, "no_source_pdf"),
    on([ScanRunStateError, ApprovalConflictError], 409, "conflict"),
    on(InvalidReviewError, 409, "invalid_review"),

    // Acervo: bibliotecas e livros. Cada erro carrega o campo a marcar, quando há um.
    on(InvalidLibraryNameError, 400, "invalid_library_name", () => ({ field: "name" })),
    // 409, não 400: o nome seria aceito num acervo onde ele não existisse.
    on(DuplicateLibraryError, 409, "duplicate_library", () => ({ field: "name" })),
    // 400 e não 409: o que falta é digitar de novo, e não mudar estado do servidor.
    on(
      [LibraryConfirmationMismatchError, PublicationConfirmationMismatchError],
      400,
      "confirmation_mismatch",
      () => ({ field: "confirmation" }),
    ),
    // A lista vai junto para a tela nomear as provas sem interpretar a mensagem.
    on(PublicationInAssessmentsError, 409, "publication_in_assessments", (error) => ({
      assessments: error.assessments,
    })),
    on(LibraryNotFoundError, 404, "library_not_found"),
    on(InvalidPublicationError, 400, "invalid_publication", (error) => ({ field: error.field })),
    on(PublicationNotFoundError, 404, "publication_not_found"),

    // Catálogo Calibre. 403 com a mesma mensagem para a pasta que existe e a que não existe.
    on(CatalogRootNotAllowedError, 403, "catalog_root_not_allowed"),
    on(CatalogUnavailableError, 422, "catalog_unavailable"),
    on(CatalogFileMissingError, 422, "source_missing"),
    on(CatalogEntryNotFoundError, 404, "catalog_entry_not_found"),
    // Com o id do que já existe: a tela oferece "abrir o que já está lá" em vez de só recusar.
    on(DuplicatePublicationError, 409, "duplicate_publication", (error) => ({
      signal: error.signal,
      publicationId: error.publicationId,
    })),
    // Os formatos que há, para a tela dizer o que existe lá em vez de só o que falta.
    on(CatalogPdfMissingError, 422, "catalog_no_pdf", (error) => ({
      availableFormats: error.availableFormats,
    })),
    on(PublicationHasSourceError, 409, "publication_has_source", (error) => ({
      publicationId: error.publicationId,
      currentSourcePdfAssetId: error.currentSourcePdfAssetId,
    })),

    // Importação do `.lbb`.
    on(PayloadTooLargeError, 413, "too_large", (error) => ({
      message: `O arquivo passa de ${Math.round(error.limitBytes / 1024 / 1024)} MB.`,
    })),
    on(ArchiveTooLargeError, 413, "too_large"),
    on(RetiredFormatVersionError, 422, "retired_format_version"),
    on(UnknownFormatVersionError, 422, "unknown_format_version"),
    on(CorruptArchiveError, 422, "corrupt_archive"),
    // Exportação. 409: o pedido está certo, o que o recusa é o tamanho da biblioteca.
    on(ExportTooLargeError, 409, "export_too_large"),
  ]);

/** A mensagem do conflito de versão diz o que mudou, na língua da tela. */
const CONFLICT_MESSAGES: Readonly<Record<string, string>> = {
  Question:
    "Esta questão mudou desde que você abriu. Recarregue para ver a versão atual antes de salvar.",
  // Renomear e mover já não chegam aqui (#259): o que sobra é o corpo salvo em outra aba.
  DocumentNode: "Este corpo foi salvo em outro lugar desde que você abriu.",
};

/**
 * Traduz erro em resposta HTTP, por uma tabela só.
 *
 * O que a tabela não conhece é **500 com JSON**, e o detalhe vai para o log do servidor, não para
 * o corpo: a tela que faz `response.json()` mostra uma mensagem em vez de cair num "Unexpected
 * token", e nenhum stack trace atravessa para o navegador.
 */
export function toErrorResponse(error: unknown): NextResponse {
  const rule = rules().find((candidate) => candidate.matches(error));
  if (rule !== undefined) {
    const { status, body } = rule.respond(error);
    return NextResponse.json(body, { status });
  }

  logger.error("http", "unhandled_error", {
    errorName: error instanceof Error ? error.name : typeof error,
    errorMessage: error instanceof Error ? error.message : String(error),
  });
  return NextResponse.json(
    { error: "internal", message: "Erro interno. O detalhe ficou no log do servidor." },
    { status: 500 },
  );
}

/**
 * Envolve o handler inteiro no tradutor, inclusive o que ficaria fora de um `try`.
 *
 * Para rota nova e para a que não tinha `try` nenhum (a consulta ao banco que estoura vira 500
 * sem corpo). As rotas com `try { … } catch (error) { return toErrorResponse(error) }` já dizem o
 * mesmo, e migram quando forem mexidas.
 */
export function withErrors<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}
