import { describe, expect, it } from "vitest";

import type {
  DocumentTreeRepository,
  TreeNodeRecord,
} from "@modules/document-tree/domain/document-tree-repository";
import { placementForAdd } from "@modules/document-tree/domain/add-placement";
import {
  DestinationNotFoundError,
  createQuestion,
  type CreatedQuestion,
  type NewQuestionNode,
  type QuestionCreator,
} from "@modules/questions/application/create-question";
import {
  DEFAULT_OPTION_COUNT,
  InvalidQuestionTypeError,
  planQuestion,
} from "@modules/questions/domain/question-blueprint";

/**
 * Slice 3 — o P0 crítico da §11.
 *
 * Uma questão não pode nascer como "apenas um `DocumentNode`". O que estes testes fixam é o
 * contrato dessa operação: tipo válido antes de qualquer escrita, destino que **pertence** à
 * publicação, alternativas iniciais montadas pelo domínio e — o mais importante — nada meio-criado
 * quando a escrita falha.
 */

const node = (over: Partial<TreeNodeRecord> = {}): TreeNodeRecord => ({
  id: "n1",
  parentId: null,
  kind: "CHAPTER",
  title: "Capítulo 1",
  sortKey: "a0",
  numberingStyle: "ARABIC",
  originalLabel: null,
  question: null,
  ...over,
});

class FakeTree implements DocumentTreeRepository {
  constructor(private readonly records: readonly TreeNodeRecord[]) {}
  listByPublication = async (): Promise<readonly TreeNodeRecord[]> => this.records;
}

class RecordingCreator implements QuestionCreator {
  received: NewQuestionNode | null = null;

  createQuestionWithNode = async (input: NewQuestionNode): Promise<CreatedQuestion> => {
    this.received = input;
    return { questionId: "q1", nodeId: "n-novo", publicationId: input.publicationId };
  };
}

/** Falha **depois** de decidir tudo — é o cenário que a transação existe para cobrir. */
class FailingCreator implements QuestionCreator {
  createQuestionWithNode = async (): Promise<CreatedQuestion> => {
    throw new Error("o banco caiu no meio");
  };
}

describe("o plano da questão", () => {
  it("dá cinco alternativas à escolha simples e à múltipla escolha", () => {
    expect(planQuestion({ type: "MULTIPLE_CHOICE" }).optionSortKeys).toHaveLength(
      DEFAULT_OPTION_COUNT,
    );
    expect(planQuestion({ type: "MULTIPLE_CORRECT" }).optionSortKeys).toHaveLength(
      DEFAULT_OPTION_COUNT,
    );
  });

  it("não dá alternativa nenhuma à discursiva", () => {
    // O design é explícito: discursiva não mostra área vazia de alternativas (§10).
    expect(planQuestion({ type: "DISCURSIVE" }).optionSortKeys).toEqual([]);
  });

  it("gera as chaves em ordem crescente", () => {
    const keys = planQuestion({ type: "MULTIPLE_CHOICE" }).optionSortKeys;
    expect([...keys].sort()).toEqual([...keys]);
  });

  it("recusa tipo fora do vocabulário", () => {
    expect(() => planQuestion({ type: "OBJETIVA" })).toThrow(InvalidQuestionTypeError);
    expect(() => planQuestion({ type: undefined })).toThrow(InvalidQuestionTypeError);
  });

  it("usa a dificuldade da escala legada, e cai no meio quando vem lixo", () => {
    // A escala é 0 · 2 · 5 · 7 · 10, não 1–5. Um `3` não é "quase médio": não existe.
    expect(planQuestion({ type: "DISCURSIVE", difficulty: 7 }).difficulty).toBe(7);
    expect(planQuestion({ type: "DISCURSIVE", difficulty: 3 }).difficulty).toBe(5);
  });
});

describe("criar questão", () => {
  it("resolve pai e posição a partir do destino", async () => {
    const creator = new RecordingCreator();

    const created = await createQuestion(
      { reader: new FakeTree([node()]), creator },
      { publicationId: "p1", type: "MULTIPLE_CHOICE", placement: { kind: "lastChild", parentId: "n1" } },
    );

    expect(created).toEqual({ questionId: "q1", nodeId: "n-novo", publicationId: "p1" });
    expect(creator.received?.parentId).toBe("n1");
    expect(creator.received?.sortKey).toBeTruthy();
  });

  it("recusa destino que não é desta publicação", async () => {
    // `resolvePlacement` já recusa irmão inexistente, mas um `parentId` de outro livro passaria
    // batido — e a questão nasceria pendurada na árvore errada.
    await expect(
      createQuestion(
        { reader: new FakeTree([node()]), creator: new RecordingCreator() },
        {
          publicationId: "p1",
          type: "MULTIPLE_CHOICE",
          placement: { kind: "lastChild", parentId: "de-outro-livro" },
        },
      ),
    ).rejects.toThrow(DestinationNotFoundError);
  });

  it("recusa o tipo **antes** de consultar a árvore", async () => {
    let consultou = false;
    const reader: DocumentTreeRepository = {
      listByPublication: async () => {
        consultou = true;
        return [];
      },
    };

    await expect(
      createQuestion(
        { reader, creator: new RecordingCreator() },
        { publicationId: "p1", type: "INVENTADO", placement: { kind: "lastChild", parentId: null } },
      ),
    ).rejects.toThrow(InvalidQuestionTypeError);

    expect(consultou, "consulta desperdiçada para recusar tipo inválido").toBe(false);
  });

  it("deixa o conteúdo mandar na quantidade de alternativas", async () => {
    // Um candidato do OCR com seis alternativas não pode nascer com as cinco do padrão e perder a
    // sexta em silêncio — isso é descartar revisão humana já feita.
    const creator = new RecordingCreator();

    await createQuestion(
      { reader: new FakeTree([]), creator },
      {
        publicationId: "p1",
        type: "MULTIPLE_CHOICE",
        placement: { kind: "lastChild", parentId: null },
        options: Array.from({ length: 6 }, (_, i) => ({
          statementLatex: `alt ${i}`,
          isCorrect: i === 2,
        })),
      },
    );

    expect(creator.received?.blueprint.optionSortKeys).toHaveLength(6);
    expect(creator.received?.options?.[2]?.isCorrect).toBe(true);
  });

  it("propaga a falha da escrita — não devolve criação pela metade", async () => {
    // A garantia de tudo-ou-nada é da transação, no adaptador. O que este teste fixa é que o caso
    // de uso **não** engole o erro devolvendo um resultado inventado.
    await expect(
      createQuestion(
        { reader: new FakeTree([]), creator: new FailingCreator() },
        {
          publicationId: "p1",
          type: "DISCURSIVE",
          placement: { kind: "lastChild", parentId: null },
        },
      ),
    ).rejects.toThrow("o banco caiu no meio");
  });
});

describe("o destino do `+ Adicionar`", () => {
  it("põe dentro do contêiner e ao lado da folha", () => {
    // A regra existe num lugar só (§72): menu, menu de contexto e destino de captura aprovada
    // precisam responder igual.
    expect(placementForAdd({ id: "c1", kind: "CHAPTER" })).toEqual({
      kind: "lastChild",
      parentId: "c1",
    });
    expect(placementForAdd({ id: "q1", kind: "QUESTION" })).toEqual({
      kind: "after",
      siblingId: "q1",
    });
  });

  it("sem seleção, vai para o fim da raiz", () => {
    expect(placementForAdd(null)).toEqual({ kind: "lastChild", parentId: null });
  });
});
