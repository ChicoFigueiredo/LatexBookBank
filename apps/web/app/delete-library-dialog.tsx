"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button, Callout, Field, Input, Modal } from "@/design-system";

/**
 * Excluir biblioteca — confirmação por nome digitado.
 *
 * O diálogo faz três coisas antes de deixar o botão vermelho funcionar: diz **o que** some (com
 * números buscados do servidor, não estimados), exige o nome digitado, e recusa fechar por clique
 * fora. As três atacam o mesmo erro — o clique automático em "Ok" — e nenhuma delas sozinha
 * bastaria.
 *
 * Os números chegam por `GET` ao abrir e não vêm da listagem: a Home só conhece a contagem de
 * livros, e "1 livro" ao lado de 240 questões perdidas é um aviso que mente por omissão.
 */

export interface DeleteLibraryTarget {
  readonly id: string;
  readonly name: string;
}

export interface DeleteLibraryDialogProps {
  /** `null` fecha. O alvo carrega o nome porque o diálogo o exige digitado de volta. */
  readonly target: DeleteLibraryTarget | null;
  readonly onClose: () => void;
  /** Depois de excluir. Sem isto a tela só recarrega os dados do servidor. */
  readonly onDeleted?: (target: DeleteLibraryTarget) => void;
}

interface Contents {
  readonly publicationCount: number;
  readonly questionCount: number;
  readonly assetCount: number;
}

/**
 * A casca só decide **se** o diálogo existe.
 *
 * O `key` é o que zera o campo digitado ao trocar de biblioteca. Fazer isso com `setState` num
 * efeito é o caminho óbvio e é o errado: além de o lint recusar, existe o frame em que o texto
 * antigo ainda está lá — e nesse frame o botão vermelho está habilitado para a biblioteca nova.
 */
export function DeleteLibraryDialog({ target, onClose, onDeleted }: DeleteLibraryDialogProps) {
  if (!target) return null;

  return (
    <DeleteLibraryConfirmation
      key={target.id}
      target={target}
      onClose={onClose}
      {...(onDeleted ? { onDeleted } : {})}
    />
  );
}

function DeleteLibraryConfirmation({
  target,
  onClose,
  onDeleted,
}: DeleteLibraryDialogProps & { readonly target: DeleteLibraryTarget }) {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [contents, setContents] = useState<Contents | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const targetId = target.id;

  useEffect(() => {
    let current = true;

    void (async () => {
      try {
        const response = await fetch(`/api/libraries/${targetId}`);
        const payload = (await response.json()) as { contents?: Contents };
        if (current && payload.contents) setContents(payload.contents);
      } catch {
        // Sem números o diálogo ainda funciona — só fica menos informado. Um erro aqui não é
        // motivo para bloquear a exclusão.
      }
    })();

    return () => {
      current = false;
    };
  }, [targetId]);

  const confirmed = typed.trim().replace(/\s+/g, " ") === target.name;

  const submit = async () => {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/libraries/${target.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: typed }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        setError(payload.message ?? "Não deu para excluir a biblioteca.");
        return;
      }

      onClose();
      onDeleted?.(target);
      router.refresh();
    } catch {
      setError("Não deu para falar com o servidor.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      // Enquanto o `DELETE` está no ar, Escape não fecha: o pedido já partiu, e fechar daria a
      // impressão de ter cancelado algo que vai acontecer de qualquer jeito.
      {...(busy ? {} : { onClose })}
      // Clicar fora é gesto ambíguo, e aqui o "não" precisa ser explícito.
      closeOnScrim={false}
      eyebrow="EXCLUIR"
      title={`Excluir “${target.name}”?`}
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" disabled={busy || !confirmed} onClick={() => void submit()}>
            {busy ? "Excluindo…" : "Excluir biblioteca"}
          </Button>
        </>
      }
    >
      <Callout tone="danger" title="Não há como desfazer">
        {contents ? describe(contents) : "Levantando o que existe dentro…"} Isso sai do banco e do
        disco. O único caminho de volta é um backup .lbb feito antes.
      </Callout>

      <div style={{ marginTop: "var(--space-4)" }}>
        <Field
          label="Digite o nome da biblioteca para confirmar"
          // O nome no hint e não no rótulo: embutido na frase ele vira leitura corrida, e o que
          // precisa ser copiado com exatidão é justamente o que fica difícil de isolar com o olho.
          hint={target.name}
          {...(error ? { error } : {})}
        >
          <Input
            autoFocus
            value={typed}
            placeholder={target.name}
            onChange={(event) => {
              setTyped(event.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && confirmed && !busy) void submit();
            }}
          />
        </Field>
      </div>
    </Modal>
  );
}

/**
 * "Vão junto 1 livro, 12 questões e 3 arquivos." — só o que for maior que zero.
 *
 * A frase começa pelo verbo de propósito: em português, "1 questão será apagada" e "3 arquivos
 * serão apagados" concordam em gênero e número com a lista, e a lista varia. "Vão junto" concorda
 * com nada e por isso nunca sai errado.
 */
function describe(contents: Contents): string {
  const parts = [
    plural(contents.publicationCount, "livro", "livros"),
    plural(contents.questionCount, "questão", "questões"),
    plural(contents.assetCount, "arquivo", "arquivos"),
  ].filter((part): part is string => part !== null);

  if (parts.length === 0) return "A biblioteca está vazia.";

  const head = parts.slice(0, -1);
  const tail = parts[parts.length - 1] ?? "";

  return `Vão junto ${head.length > 0 ? `${head.join(", ")} e ${tail}` : tail}.`;
}

const plural = (count: number, one: string, many: string): string | null =>
  count > 0 ? `${count} ${count === 1 ? one : many}` : null;
