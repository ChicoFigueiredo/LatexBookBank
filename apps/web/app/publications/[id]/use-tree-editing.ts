"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import type { TreeCommand } from "@/design-system";
import type { Placement } from "@modules/document-tree/domain/tree-mutations";

/**
 * Liga os gestos da árvore às rotas de mutação.
 *
 * Fica fora do componente porque a lógica é de fluxo, não de layout: o que fazer quando a API
 * recusa por ciclo, quando pedir confirmação, quando recarregar. O componente só renderiza o
 * que este hook devolve.
 *
 * **Sem estado otimista.** A árvore recarrega do servidor depois de cada mutação. É mais lento —
 * um ida-e-volta — e é o certo aqui: `sortKey` é decidido no servidor a partir dos irmãos, e
 * adivinhar no cliente produziria uma ordem que se corrige sozinha na tela seguinte. Quando
 * incomodar, o lugar de resolver é devolver o nó criado com a chave, não simular a decisão.
 */

export interface TreeEditingError {
  readonly title: string;
  readonly message: string;
}

interface Options {
  readonly publicationId: string;
  /** Título do nó, para as mensagens de confirmação. */
  readonly titleOf: (nodeId: string) => string;
  /** Vizinhos na ordem visível, para o Alt+↑/↓ saber para onde mover. */
  readonly siblingOrderOf: (nodeId: string) => {
    readonly previous?: string;
    readonly next?: string;
  };
  readonly onSelect: (nodeId: string) => void;
}

export function useTreeEditing({ publicationId, titleOf, siblingOrderOf, onSelect }: Options) {
  const router = useRouter();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TreeEditingError | null>(null);

  const base = `/api/publications/${publicationId}/nodes`;

  const call = useCallback(
    async (input: string, init: RequestInit, failure: string): Promise<unknown | null> => {
      setBusy(true);
      setError(null);
      try {
        const response = await fetch(input, {
          ...init,
          headers: { "content-type": "application/json", ...init.headers },
        });
        const payload: unknown = await response.json().catch(() => null);

        if (!response.ok) {
          const message =
            typeof payload === "object" && payload !== null && "message" in payload
              ? String((payload as { message: unknown }).message)
              : `A requisição falhou com status ${response.status}.`;
          // A mensagem vem do servidor porque é lá que a regra vive: "criaria um ciclo",
          // "o ancestral continua excluído". Reescrever aqui só perderia informação.
          setError({ title: failure, message });
          return null;
        }

        // `refresh` reexecuta o Server Component e traz a árvore nova sem recarregar a página —
        // o estado do shell (larguras, aside, expandidos) sobrevive.
        router.refresh();
        return payload;
      } catch {
        setError({
          title: failure,
          message: "Não foi possível falar com o servidor. Verifique se a aplicação está rodando.",
        });
        return null;
      } finally {
        setBusy(false);
      }
    },
    [router],
  );

  const create = useCallback(
    async (placement: Placement, kind = "SECTION") => {
      const created = await call(
        base,
        { method: "POST", body: JSON.stringify({ kind, title: null, placement }) },
        "Não foi possível criar o nó",
      );
      const id =
        typeof created === "object" && created !== null && "id" in created
          ? String((created as { id: unknown }).id)
          : null;

      // Criado sem título, já em renomeação: nó novo sem nome é indistinguível dos outros na
      // árvore, e obrigar a achá-lo para renomear seria trabalho que a máquina pode poupar.
      if (id) {
        onSelect(id);
        setEditingId(id);
      }
    },
    [base, call, onSelect],
  );

  const move = useCallback(
    async (nodeId: string, placement: Placement) => {
      await call(
        `${base}/${nodeId}`,
        { method: "PATCH", body: JSON.stringify({ placement }) },
        "Não foi possível mover o nó",
      );
    },
    [base, call],
  );

  const rename = useCallback(
    async (nodeId: string, title: string) => {
      setEditingId(null);
      await call(
        `${base}/${nodeId}`,
        { method: "PATCH", body: JSON.stringify({ title }) },
        "Não foi possível renomear o nó",
      );
    },
    [base, call],
  );

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    const nodeId = pendingDelete;
    setPendingDelete(null);
    await call(`${base}/${nodeId}`, { method: "DELETE" }, "Não foi possível excluir o nó");
  }, [base, call, pendingDelete]);

  const handleCommand = useCallback(
    (command: TreeCommand) => {
      switch (command.kind) {
        case "rename":
          setEditingId(command.nodeId);
          break;
        case "delete":
          // Confirmação sempre, nunca exclusão direta: a operação leva a descendência junto, e
          // quem apertou Del pode ter querido apagar um caractere no campo ao lado.
          setPendingDelete(command.nodeId);
          break;
        case "createChild":
          void create({ kind: "lastChild", parentId: command.nodeId });
          break;
        case "createSibling":
          void create({ kind: "after", siblingId: command.nodeId });
          break;
        case "moveUp": {
          const { previous } = siblingOrderOf(command.nodeId);
          if (previous) void move(command.nodeId, { kind: "before", siblingId: previous });
          break;
        }
        case "moveDown": {
          const { next } = siblingOrderOf(command.nodeId);
          if (next) void move(command.nodeId, { kind: "after", siblingId: next });
          break;
        }
      }
    },
    [create, move, siblingOrderOf],
  );

  return {
    editingId,
    busy,
    error,
    pendingDelete,
    pendingDeleteTitle: pendingDelete ? titleOf(pendingDelete) : null,
    handleCommand,
    rename,
    create,
    confirmDelete,
    cancelDelete: () => setPendingDelete(null),
    cancelEditing: () => setEditingId(null),
    dismissError: () => setError(null),
  };
}
