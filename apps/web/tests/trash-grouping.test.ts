import { describe, expect, it } from "vitest";

import {
  type NoExcluido,
  agruparLixeira,
  contagemDoRodape,
  frasedoQueLevou,
} from "@modules/document-tree/domain/trash-grouping";

/**
 * A conta que sustenta a promessa do botão.
 *
 * `Restaurar (7 itens)` é um contrato: se a conta erra, o usuário clica esperando sete e recebe
 * outra coisa — e descobre isso olhando uma árvore incompleta, não uma mensagem de erro.
 */

const no = (parcial: Partial<NoExcluido> & { id: string }): NoExcluido => ({
  parentId: null,
  kind: "QUESTION",
  title: null,
  originalLabel: null,
  deletedAt: new Date("2026-08-12T09:00:00Z"),
  hasQuestion: false,
  nickname: null,
  ...parcial,
});

describe("agruparLixeira", () => {
  it("um grupo excluído é UMA linha, com o que levou junto", () => {
    // O caso do protótipo: grupo + 6 questões = 7 linhas no banco, 1 ato do usuário.
    const nos = [
      no({ id: "g", kind: "QUESTION_GROUP", title: "Exercícios complementares" }),
      ...Array.from({ length: 6 }, (_, i) =>
        no({ id: `q${i}`, parentId: "g", hasQuestion: true, originalLabel: String(i + 1) }),
      ),
    ];

    const { atos, itemCount, objectCount } = agruparLixeira(nos);

    expect(atos).toHaveLength(1);
    expect(atos[0]?.title).toBe("Exercícios complementares");
    expect(atos[0]?.restoresCount).toBe(7);
    expect(atos[0]?.questionsTaken).toBe(6);
    expect(itemCount).toBe(1);
    expect(objectCount).toBe(7);
  });

  it("a própria questão excluída não conta como levada junto", () => {
    const { atos } = agruparLixeira([no({ id: "q", hasQuestion: true, originalLabel: "33" })]);

    expect(atos[0]?.restoresCount).toBe(1);
    expect(atos[0]?.questionsTaken).toBe(0);
    expect(frasedoQueLevou(atos[0]!)).toBeNull();
  });

  it("nó com pai também na lixeira não vira linha própria", () => {
    // Restaurá-lo sozinho o devolveria para debaixo de um pai invisível — a regra do `restoreNode`.
    const nos = [
      no({ id: "c", kind: "CHAPTER", title: "Conjuntos" }),
      no({ id: "s", parentId: "c", kind: "SECTION", title: "Exercícios" }),
    ];

    expect(agruparLixeira(nos).atos.map((a) => a.id)).toEqual(["c"]);
  });

  it("dois atos separados continuam dois — e o mais recente vem primeiro", () => {
    const nos = [
      no({ id: "a", title: "Antigo", deletedAt: new Date("2026-08-10T09:00:00Z") }),
      no({ id: "b", title: "Recente", deletedAt: new Date("2026-08-12T09:00:00Z") }),
    ];

    expect(agruparLixeira(nos).atos.map((a) => a.title)).toEqual(["Recente", "Antigo"]);
  });

  it("questão sem título se identifica pelo rótulo do livro, e não por “sem título”", () => {
    const { atos } = agruparLixeira([no({ id: "q", kind: "QUESTION", originalLabel: "27" })]);

    expect(atos[0]?.title).toBe("Questão 27");
  });

  it("sem título e sem rótulo, sobra o tipo — que ainda diz mais que nada", () => {
    const { atos } = agruparLixeira([no({ id: "n", kind: "QUESTION_GROUP" })]);

    expect(atos[0]?.title).toBe("Grupo");
  });

  it("rótulo e apelido juntos, como no protótipo", () => {
    const { atos } = agruparLixeira([
      no({ id: "q", kind: "QUESTION", originalLabel: "33", nickname: "Progressão aritmética" }),
    ]);

    expect(atos[0]?.title).toBe("Questão 33 · Progressão aritmética");
  });

  it("apelido igual ao rótulo não vira “Questão 27 · 27”", () => {
    const { atos } = agruparLixeira([
      no({ id: "q", kind: "QUESTION", originalLabel: "27", nickname: "27" }),
    ]);

    expect(atos[0]?.title).toBe("Questão 27");
  });

  it("lixeira vazia é zero item e zero objeto, sem estourar", () => {
    expect(agruparLixeira([])).toEqual({ atos: [], itemCount: 0, objectCount: 0 });
  });

  it("ciclo entre nós excluídos não trava a conta", () => {
    const nos = [
      no({ id: "a", parentId: "b" }),
      no({ id: "b", parentId: "a" }),
    ];

    // Nenhum é raiz — os dois têm pai na lixeira. Não deveria acontecer; travar seria pior.
    expect(() => agruparLixeira(nos)).not.toThrow();
  });
});

describe("os rótulos do rodapé", () => {
  it("plural certo dos dois lados", () => {
    expect(contagemDoRodape({ atos: [], itemCount: 1, objectCount: 1 })).toBe("1 item · 1 objeto");
    expect(contagemDoRodape({ atos: [], itemCount: 2, objectCount: 8 })).toBe("2 itens · 8 objetos");
  });

  it("“levou 1 questão”, no singular", () => {
    const nos = [
      no({ id: "g", kind: "QUESTION_GROUP", title: "Grupo" }),
      no({ id: "q", parentId: "g", hasQuestion: true }),
    ];

    expect(frasedoQueLevou(agruparLixeira(nos).atos[0]!)).toBe("levou 1 questão com ele");
  });
});
