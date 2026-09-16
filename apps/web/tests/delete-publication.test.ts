import { describe, expect, it, vi } from "vitest";

import { deletePublication } from "@modules/publications/application/manage-publications";
import {
  matchesPublicationTitle,
  PublicationConfirmationMismatchError,
} from "@modules/publications/domain/publication-draft";
import type {
  PublicationContents,
  PublicationRepository,
} from "@modules/publications/domain/publication-repository";
import type { StorageProvider } from "@/shared/ports";

/**
 * Excluir um livro — a segunda operação sem volta do produto.
 *
 * Não existia: dava para excluir a **biblioteca** inteira e dava para mandar nó e questão para a
 * lixeira, mas um livro importado por engano — a entrada errada do Calibre, a duplicata que só
 * aparece depois — ficava no acervo para sempre, e a única saída era apagar a biblioteca em volta.
 *
 * O que estes testes guardam não é o caminho feliz: é que **nada é apagado sem a confirmação**, e
 * que a falha ao remover um arquivo do disco não inventa um erro sobre um livro que já não existe.
 */

const CONTEUDO: PublicationContents = {
  questionCount: 148,
  nodeCount: 312,
  assetCount: 9,
  anchorCount: 41,
};

function fakes(over: Partial<PublicationRepository> = {}) {
  const apagados: string[] = [];
  const removidos: string[] = [];

  const repository = {
    findById: vi.fn(async () => ({
      id: "p1",
      workspaceId: "w1",
      title: "Fundamentos de Matemática Elementar 1",
      nickname: "FME 1",
      publisher: null,
      nodeCount: 312,
    })),
    contentsOf: vi.fn(async () => CONTEUDO),
    listAssetKeys: vi.fn(async () => ["w1/a.pdf", "w1/b.png"]),
    delete: vi.fn(async (id: string) => {
      removidos.push(id);
      return true;
    }),
    ...over,
  } as unknown as PublicationRepository;

  const storage = {
    delete: vi.fn(async (key: string) => {
      apagados.push(key);
    }),
  } as unknown as StorageProvider;

  return { repository, storage, apagados, removidos };
}

describe("deletePublication", () => {
  it("apaga o livro, as questões e os arquivos quando o título confere", async () => {
    const { repository, storage, apagados, removidos } = fakes();

    const resultado = await deletePublication(repository, storage, "p1", {
      title: "Fundamentos de Matemática Elementar 1",
    });

    expect(removidos).toEqual(["p1"]);
    expect(apagados).toEqual(["w1/a.pdf", "w1/b.png"]);
    // Os números vêm do repositório, e não de estimativa: é o que o diálogo mostra antes do clique.
    expect(resultado).toMatchObject({ ...CONTEUDO, title: "Fundamentos de Matemática Elementar 1" });
  });

  it("**recusa** com o título errado, e não apaga nada", async () => {
    const { repository, storage, apagados, removidos } = fakes();

    await expect(
      deletePublication(repository, storage, "p1", { title: "Fundamentos de Matemática" }),
    ).rejects.toBeInstanceOf(PublicationConfirmationMismatchError);

    // A afirmação que importa: recusar não é só devolver erro — é não ter tocado em nada.
    expect(removidos).toEqual([]);
    expect(apagados).toEqual([]);
  });

  it("recusa título ausente ou de outro tipo", async () => {
    const { repository, storage } = fakes();

    for (const title of [undefined, null, 42, {}]) {
      await expect(deletePublication(repository, storage, "p1", { title })).rejects.toBeInstanceOf(
        PublicationConfirmationMismatchError,
      );
    }
  });

  it("arquivo que não sai do disco não derruba a exclusão", async () => {
    /*
     * Best-effort de propósito, como na biblioteca: quando o storage falha, o banco **já** não
     * referencia aquele arquivo. Dizer "não deu para excluir" sobre um livro que já não existe
     * mandaria a pessoa tentar de novo um gesto que não tem mais alvo.
     */
    const { repository } = fakes();
    const storage = {
      delete: vi.fn(async () => {
        throw new Error("arquivo preso pelo antivírus");
      }),
    } as unknown as StorageProvider;

    await expect(
      deletePublication(repository, storage, "p1", {
        title: "Fundamentos de Matemática Elementar 1",
      }),
    ).resolves.toMatchObject({ questionCount: 148 });
  });
});

describe("matchesPublicationTitle", () => {
  it("espaço extra é digitação, não discordância", () => {
    expect(matchesPublicationTitle("  FME  1 ", "FME 1")).toBe(true);
  });

  it("caixa e acento **são** discordância", () => {
    // Um título quase certo é o sinal de quem não leu direito — que é exatamente quem a
    // confirmação existe para parar.
    expect(matchesPublicationTitle("fme 1", "FME 1")).toBe(false);
    expect(matchesPublicationTitle("Matematica", "Matemática")).toBe(false);
  });
});
