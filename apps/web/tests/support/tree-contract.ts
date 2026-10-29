import { describe, expect, it } from "vitest";

import {
  DeletedAncestorError,
  createNode,
  deleteNode,
  duplicateNode,
  moveNode,
  renameNode,
  restoreNode,
} from "@modules/document-tree/application/mutate-tree";
import { CyclicMoveError, NodeNotFoundError } from "@modules/document-tree/domain/tree-mutations";

/**
 * O contrato da árvore: as regras de `mutate-tree` vistas só pelas portas.
 *
 * Roda igual contra o dublê em memória e contra o adaptador Prisma (TST-05 da revisão de
 * 2026-09-23). Antes, as regras eram provadas só no dublê, e o dublê podia divergir do banco sem
 * ninguém ver — ignorava a publicação, gravava o mesmo `deletedAt` em toda exclusão. Aqui o
 * teste não sabe qual dos dois tem na mão: o que ele confere tem de valer nos dois.
 *
 * Nada de id fixo nem de espiar a linha gravada: o livro nasce pelos casos de uso, e o que se
 * confere é o que `listByPublication` e `listDeleted` devolvem.
 */

type Deps = Parameters<typeof createNode>[0];

export interface Bancada {
  readonly deps: Deps;
  /** Uma publicação vazia, só deste teste. */
  novaPublicacao(): Promise<string>;
}

/**
 * cap1 ─ sec1 ─ sub1
 *      └ sec2
 * cap2
 */
async function livro({ deps, novaPublicacao }: Bancada) {
  const pub = await novaPublicacao();
  const criar = (
    kind: "CHAPTER" | "SECTION" | "SUBSECTION",
    title: string,
    parentId: string | null,
  ) =>
    createNode(deps, {
      publicationId: pub,
      kind,
      title,
      placement: { kind: "lastChild", parentId },
    });

  const cap1 = await criar("CHAPTER", "Capítulo 1", null);
  const cap2 = await criar("CHAPTER", "Capítulo 2", null);
  const sec1 = await criar("SECTION", "Seção 1.1", cap1);
  const sec2 = await criar("SECTION", "Seção 1.2", cap1);
  const sub1 = await criar("SUBSECTION", "Sub", sec1);

  /** A árvore viva: título → título do pai, na ordem de leitura. */
  const arvore = async () => {
    const rows = await deps.reader.listByPublication(pub);
    const titulo = new Map(rows.map((row) => [row.id, row.title]));
    return rows.map((row) => ({
      title: row.title,
      parent: row.parentId === null ? null : (titulo.get(row.parentId) ?? "?"),
    }));
  };
  const no = async (id: string) =>
    (await deps.reader.listByPublication(pub)).find((row) => row.id === id);
  const filhos = async (parentId: string | null) =>
    (await deps.reader.listByPublication(pub)).filter((row) => row.parentId === parentId);
  const lixeira = async () => (await deps.writer.listDeleted(pub)).map((row) => row.id).sort();

  return { pub, cap1, cap2, sec1, sec2, sub1, arvore, no, filhos, lixeira };
}

export function contratoDaArvore(nome: string, bancada: () => Bancada): void {
  describe(`contrato da árvore — ${nome}`, () => {
    describe("criar", () => {
      it("cria filho no fim, depois dos irmãos existentes", async () => {
        const b = bancada();
        const { pub, cap1, sec2, no, filhos } = await livro(b);

        const id = await createNode(b.deps, {
          publicationId: pub,
          kind: "SECTION",
          title: "Seção 1.3",
          placement: { kind: "lastChild", parentId: cap1 },
        });

        expect((await filhos(cap1)).map((row) => row.title)).toEqual([
          "Seção 1.1",
          "Seção 1.2",
          "Seção 1.3",
        ]);
        expect((await no(id))!.sortKey > (await no(sec2))!.sortKey).toBe(true);
      });

      it("cria irmão exatamente na fresta entre dois nós", async () => {
        const b = bancada();
        const { pub, cap1, sec1, filhos } = await livro(b);

        await createNode(b.deps, {
          publicationId: pub,
          kind: "SECTION",
          title: "Entremeio",
          placement: { kind: "after", siblingId: sec1 },
        });

        expect((await filhos(cap1)).map((row) => row.title)).toEqual([
          "Seção 1.1",
          "Entremeio",
          "Seção 1.2",
        ]);
      });

      it("recusa criar sob pai inexistente", async () => {
        const b = bancada();
        const { pub, arvore } = await livro(b);
        const antes = await arvore();

        await expect(
          createNode(b.deps, {
            publicationId: pub,
            kind: "SECTION",
            title: "Órfão",
            placement: { kind: "lastChild", parentId: "fantasma" },
          }),
        ).rejects.toThrow(NodeNotFoundError);
        expect(await arvore()).toEqual(antes);
      });
    });

    describe("renomear", () => {
      it("troca o título, e só o dele", async () => {
        const b = bancada();
        const { pub, sec1, arvore } = await livro(b);

        await renameNode(b.deps, pub, sec1, "Conceitos iniciais");

        expect((await arvore()).map((row) => row.title)).toContain("Conceitos iniciais");
        expect((await arvore()).map((row) => row.title)).not.toContain("Seção 1.1");
      });

      it("recusa nó inexistente em vez de criar linha nova", async () => {
        const b = bancada();
        const { pub, arvore } = await livro(b);
        const antes = await arvore();

        await expect(renameNode(b.deps, pub, "fantasma", "x")).rejects.toThrow(NodeNotFoundError);
        expect(await arvore()).toEqual(antes);
      });
    });

    describe("mover", () => {
      it("move para outro pai, e a descendência vai junto", async () => {
        const b = bancada();
        const { pub, sec1, cap2, arvore } = await livro(b);

        await moveNode(b.deps, pub, sec1, { kind: "lastChild", parentId: cap2 });

        const depois = await arvore();
        expect(depois).toContainEqual({ title: "Seção 1.1", parent: "Capítulo 2" });
        expect(depois).toContainEqual({ title: "Sub", parent: "Seção 1.1" });
      });

      it("recusa mover para dentro da própria descendência, sem gravar nada", async () => {
        const b = bancada();
        const { pub, cap1, sub1, arvore } = await livro(b);
        const antes = await arvore();

        await expect(
          moveNode(b.deps, pub, cap1, { kind: "lastChild", parentId: sub1 }),
        ).rejects.toThrow(CyclicMoveError);
        expect(await arvore()).toEqual(antes);
      });

      it("reordenar entre irmãos não muda o pai", async () => {
        const b = bancada();
        const { pub, cap1, sec1, sec2, filhos } = await livro(b);

        await moveNode(b.deps, pub, sec2, { kind: "before", siblingId: sec1 });

        expect((await filhos(cap1)).map((row) => row.title)).toEqual(["Seção 1.2", "Seção 1.1"]);
      });
    });

    describe("excluir", () => {
      it("marca o nó e toda a descendência, e a árvore viva fica sem eles", async () => {
        const b = bancada();
        const { pub, cap1, sec1, sec2, sub1, arvore, lixeira } = await livro(b);

        const removidos = await deleteNode(b.deps, pub, cap1);

        expect([...removidos].sort()).toEqual([cap1, sec1, sec2, sub1].sort());
        expect(await lixeira()).toEqual([cap1, sec1, sec2, sub1].sort());
        expect(await arvore()).toEqual([{ title: "Capítulo 2", parent: null }]);
      });
    });

    describe("restaurar", () => {
      it("traz de volta o nó e a descendência excluída junto, no lugar de antes", async () => {
        const b = bancada();
        const { pub, sec1, sub1, arvore, lixeira } = await livro(b);
        const antes = await arvore();
        await deleteNode(b.deps, pub, sec1);

        const restaurados = await restoreNode(b.deps, pub, sec1);

        expect([...restaurados].sort()).toEqual([sec1, sub1].sort());
        expect(await lixeira()).toEqual([]);
        expect(await arvore()).toEqual(antes);
      });

      it("recusa restaurar com o ancestral ainda excluído, e nada volta", async () => {
        const b = bancada();
        const { pub, cap1, sec1, lixeira } = await livro(b);
        await deleteNode(b.deps, pub, cap1);

        await expect(restoreNode(b.deps, pub, sec1)).rejects.toThrow(DeletedAncestorError);
        expect(await lixeira()).toHaveLength(4);
      });

      it("um filho excluído à parte, antes do pai, não volta de carona", async () => {
        // A regra (#260): o filho excluído antes é um ato próprio. Só o instante de cada ato os
        // distingue — e é o `deletedAt` que o adaptador grava, não o que o dublê inventa.
        const b = bancada();
        const { pub, sec1, sub1, no, lixeira } = await livro(b);
        await deleteNode(b.deps, pub, sub1);
        await deleteNode(b.deps, pub, sec1);

        expect(await restoreNode(b.deps, pub, sec1)).toEqual([sec1]);
        expect(await lixeira()).toEqual([sub1]);

        expect(await restoreNode(b.deps, pub, sub1)).toEqual([sub1]);
        expect((await no(sub1))?.parentId).toBe(sec1);
      });

      it("não repete a sortKey de um irmão criado enquanto o nó estava na lixeira", async () => {
        const b = bancada();
        const { pub, cap1, sec1, filhos } = await livro(b);
        await deleteNode(b.deps, pub, sec1);
        const nova = await createNode(b.deps, {
          publicationId: pub,
          kind: "SECTION",
          title: "Seção nova",
          placement: { kind: "firstChild", parentId: cap1 },
        });

        await restoreNode(b.deps, pub, sec1);

        const irmaos = await filhos(cap1);
        expect(new Set(irmaos.map((row) => row.sortKey)).size).toBe(irmaos.length);
        // E a árvore continua aceitando inserção ali — com chaves repetidas, isto respondia 500.
        await expect(
          createNode(b.deps, {
            publicationId: pub,
            kind: "SECTION",
            title: "Entremeio",
            placement: { kind: "after", siblingId: nova },
          }),
        ).resolves.toBeTypeOf("string");
      });

      it("um irmão criado entre a leitura e a restauração não repete a sortKey (ACV-09)", async () => {
        // A escrita concorrente cai depois de tudo que o caso de uso leu, e antes da transação da
        // restauração: só a leitura feita dentro da transação a enxerga.
        const b = bancada();
        const { pub, cap1, sec1, filhos } = await livro(b);
        await deleteNode(b.deps, pub, sec1);
        const writer = new Proxy(b.deps.writer, {
          get(target, prop) {
            const value: unknown = Reflect.get(target, prop, target);
            if (prop === "restoreMany") {
              return async (...args: Parameters<typeof target.restoreMany>) => {
                await createNode(b.deps, {
                  publicationId: pub,
                  kind: "SECTION",
                  title: "Seção concorrente",
                  placement: { kind: "firstChild", parentId: cap1 },
                });
                return target.restoreMany(...args);
              };
            }
            return typeof value === "function" ? value.bind(target) : value;
          },
        });

        await restoreNode({ reader: b.deps.reader, writer }, pub, sec1);

        const irmaos = await filhos(cap1);
        expect(irmaos.map((row) => row.title)).toContain("Seção concorrente");
        expect(new Set(irmaos.map((row) => row.sortKey)).size).toBe(irmaos.length);
      });

      it("sem colisão, a sortKey de antes fica", async () => {
        const b = bancada();
        const { pub, sec1, no } = await livro(b);
        const chave = (await no(sec1))?.sortKey;
        await deleteNode(b.deps, pub, sec1);

        await restoreNode(b.deps, pub, sec1);

        expect((await no(sec1))?.sortKey).toBe(chave);
      });

      it("recusa restaurar o que não está na lixeira", async () => {
        const b = bancada();
        const { pub, cap2 } = await livro(b);

        await expect(restoreNode(b.deps, pub, cap2)).rejects.toThrow(NodeNotFoundError);
      });
    });

    describe("duplicar", () => {
      it("copia a subárvore inteira, com a hierarquia, sem mexer no original", async () => {
        const b = bancada();
        const { pub, cap1, arvore, no, filhos } = await livro(b);
        const antes = await b.deps.reader.listByPublication(pub);
        const originais = new Set(antes.map((row) => row.id));

        const raiz = await duplicateNode(b.deps, pub, cap1, { kind: "after", siblingId: cap1 });

        const depois = await b.deps.reader.listByPublication(pub);
        const copias = depois.filter((row) => !originais.has(row.id));
        // Só a raiz leva o "(cópia)": é ela que aparece ao lado do original.
        expect(copias.map((row) => row.title).sort()).toEqual(
          ["Capítulo 1 (cópia)", "Seção 1.1", "Seção 1.2", "Sub"].sort(),
        );
        // Cada cópia aponta para uma cópia, nunca para o original; a raiz entra ao lado.
        const idsDasCopias = new Set(copias.map((row) => row.id));
        for (const copia of copias) {
          if (copia.id === raiz) continue;
          expect(idsDasCopias.has(copia.parentId as string), `${copia.title} sob cópia`).toBe(true);
        }
        expect((await no(raiz))?.parentId).toBe(null);
        expect((await filhos(null)).map((row) => row.title)).toEqual([
          "Capítulo 1",
          "Capítulo 1 (cópia)",
          "Capítulo 2",
        ]);
        // O original segue igual: mesmas linhas, mesmos pais, mesmas chaves.
        expect(depois.filter((row) => originais.has(row.id))).toEqual(antes);
        expect(await arvore()).toHaveLength(antes.length + 4);
      });

      it("duplicar uma folha cria um nó só, na posição pedida", async () => {
        const b = bancada();
        const { pub, sub1, sec2, filhos } = await livro(b);

        await duplicateNode(b.deps, pub, sub1, { kind: "lastChild", parentId: sec2 });

        expect((await filhos(sec2)).map((row) => row.title)).toEqual(["Sub (cópia)"]);
      });
    });

    describe("cada livro é um livro", () => {
      it("o nó de outra publicação não é achado por esta: nem renomeia, nem move, nem exclui", async () => {
        const b = bancada();
        const meu = await livro(b);
        const outro = await livro(b);
        const antes = await outro.arvore();

        await expect(renameNode(b.deps, meu.pub, outro.sec1, "invadido")).rejects.toThrow(
          NodeNotFoundError,
        );
        await expect(
          moveNode(b.deps, meu.pub, outro.sec1, { kind: "lastChild", parentId: meu.cap2 }),
        ).rejects.toThrow(NodeNotFoundError);
        await expect(deleteNode(b.deps, meu.pub, outro.sec1)).rejects.toThrow(NodeNotFoundError);

        expect(await outro.arvore()).toEqual(antes);
      });

      it("a lixeira de um livro não mostra nem restaura o que saiu do outro", async () => {
        const b = bancada();
        const meu = await livro(b);
        const outro = await livro(b);
        await deleteNode(b.deps, outro.pub, outro.sec1);

        expect(await meu.lixeira()).toEqual([]);
        await expect(restoreNode(b.deps, meu.pub, outro.sec1)).rejects.toThrow(NodeNotFoundError);
        expect(await outro.lixeira()).toEqual([outro.sec1, outro.sub1].sort());
      });
    });
  });
}
