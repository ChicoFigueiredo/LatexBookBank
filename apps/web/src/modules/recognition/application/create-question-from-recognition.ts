import type { DocumentTreeRepository } from "@modules/document-tree/domain/document-tree-repository";
import type { Placement } from "@modules/document-tree/domain/tree-mutations";
import {
  createQuestion,
  type CreatedQuestion,
  type QuestionCreator,
} from "@modules/questions/application/create-question";
import type { ApprovedCandidate } from "@modules/recognition/domain/recognition-candidate";

/**
 * Aceitar e criar questão — o Slice 8.
 *
 * O que existia antes: a tela de ingestão reconhecia, a pessoa conferia, e o LaTeX ficava
 * **guardado na tela** com o recado "cole na questão". Copiar e colar entre telas internas do
 * próprio produto é exatamente o que a §2 do prompt do time lista como inaceitável — e é onde o
 * trabalho de revisão se perdia num recarregamento de página.
 *
 * Agora: candidato aprovado + destino → questão persistida, com nó, alternativas, proveniência e
 * uma rota navegável de volta.
 *
 * **Em falha, o recorte não desaparece** (§24). O `Asset(CROP)` e o `SourceAnchor` foram gravados
 * antes, por outra rota, e nada aqui os apaga: falhar em criar a questão devolve a pessoa à tela
 * de revisão com o candidato inteiro.
 */

export class RecognitionProvenanceError extends Error {
  constructor(readonly anchorId: string) {
    super(`A âncora ${anchorId} não existe — o recorte precisa ser salvo antes.`);
    this.name = "RecognitionProvenanceError";
  }
}

/** Grava, na âncora, qual execução do reconhecedor originou a versão aprovada (§69). */
export interface RecognitionProvenanceWriter {
  /** `false` quando a âncora não existe. */
  recordRun(anchorId: string, run: ApprovedCandidate["run"]): Promise<boolean>;
}

export interface CreateFromRecognitionCommand {
  readonly publicationId: string;
  readonly placement: Placement;
  readonly type: unknown;
  readonly candidate: ApprovedCandidate;
}

export interface CreateFromRecognitionResult extends CreatedQuestion {
  /** Para onde a interface deve levar quem acabou de criar (§73). */
  readonly href: string;
  readonly warnings: readonly string[];
}

export async function createQuestionFromRecognition(
  deps: {
    readonly reader: DocumentTreeRepository;
    readonly creator: QuestionCreator;
    readonly provenance: RecognitionProvenanceWriter;
  },
  command: CreateFromRecognitionCommand,
): Promise<CreateFromRecognitionResult> {
  const { candidate } = command;

  // A proveniência é gravada **antes** da questão, e a razão é a ordem do estrago: se a âncora não
  // existe, a questão nasceria sem origem e ninguém notaria até alguém perguntar de onde ela veio.
  // Falhar aqui não perde nada — nada foi criado ainda.
  const recorded = await deps.provenance.recordRun(candidate.source.anchorId, candidate.run);
  if (!recorded) throw new RecognitionProvenanceError(candidate.source.anchorId);

  const created = await createQuestion(
    { reader: deps.reader, creator: deps.creator },
    {
      publicationId: command.publicationId,
      type: command.type,
      placement: command.placement,
      originalLabel: candidate.originalLabel,
      // A âncora vai para a questão **e** para o nó, dentro da mesma transação de criação: é ela
      // que responde "de qual página deste livro isto saiu?" na aba Origem.
      sourceAnchorId: candidate.source.anchorId,
      statementLatex: candidate.statementLatex,
      solutionLatex: candidate.solutionLatex,
      // Sem alternativas, o tipo decide quantas nascem vazias — uma discursiva nasce sem nenhuma,
      // e uma escolha simples reconhecida sem alternativas nasce com as cinco do padrão para
      // preencher à mão.
      ...(candidate.options.length > 0 ? { options: candidate.options } : {}),
    },
  );

  return {
    ...created,
    href: `/publications/${created.publicationId}?node=${created.nodeId}`,
    warnings: candidate.warnings,
  };
}
