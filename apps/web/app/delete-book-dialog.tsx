"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button, Callout, Field, Input, Modal } from "@/design-system";

/**
 * Excluir livro — confirmação por título digitado.
 *
 * Irmão do `DeleteLibraryDialog`, e deliberadamente com a mesma forma: os dois apagam de verdade, e
 * dois gestos igualmente definitivos com cerimônias diferentes ensinam que a cerimônia é decorativa.
 *
 * O protótipo põe `Excluir` no menu `⋯` de cada linha da estante, ao lado de `Renomear`,
 * `Duplicar` e `Exportar`. Antes disto **não havia como excluir um livro**: um importado por engano
 * — a entrada errada do Calibre, a duplicata que só aparece depois — ficava no acervo para sempre,
 * e a única saída era apagar a biblioteca em volta dele.
 *
 * Os números vêm por `GET` ao abrir, e não da listagem: a estante conhece a contagem de questões e
 * mais nada, e “148 questões” sem os recortes de origem é um aviso que mente por omissão — a
 * evidência é o que menos se refaz.
 */

export interface DeleteBookTarget {
  readonly id: string;
  readonly title: string;
}

export interface DeleteBookDialogProps {
  readonly target: DeleteBookTarget | null;
  readonly onClose: () => void;
  readonly onDeleted?: (target: DeleteBookTarget) => void;
}

interface Contents {
  readonly questionCount: number;
  readonly nodeCount: number;
  readonly assetCount: number;
  readonly anchorCount: number;
}

/**
 * A casca só decide **se** o diálogo existe.
 *
 * O `key` zera o campo digitado ao trocar de livro. Fazer isso com `setState` num efeito deixa um
 * frame em que o texto antigo ainda está lá — e nesse frame o botão vermelho está habilitado para
 * o livro novo.
 */
export function DeleteBookDialog({ target, onClose, onDeleted }: DeleteBookDialogProps) {
  if (!target) return null;

  return (
    <DeleteBookConfirmation
      key={target.id}
      target={target}
      onClose={onClose}
      {...(onDeleted ? { onDeleted } : {})}
    />
  );
}

function DeleteBookConfirmation({
  target,
  onClose,
  onDeleted,
}: DeleteBookDialogProps & { readonly target: DeleteBookTarget }) {
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
        const response = await fetch(`/api/publications/${targetId}/contents`);
        const payload = (await response.json()) as { contents?: Contents };
        if (current && payload.contents) setContents(payload.contents);
      } catch {
        // Sem números o diálogo ainda funciona — só fica menos informado, e a confirmação por
        // título continua no lugar.
      }
    })();

    return () => {
      current = false;
    };
  }, [targetId]);

  const confirmed = typed.trim().replace(/\s+/g, " ") === target.title;

  const submit = async () => {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/publications/${target.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: typed }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        setError(payload.message ?? "Não deu para excluir o livro.");
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
      {...(busy ? {} : { onClose })}
      closeOnScrim={false}
      eyebrow="EXCLUIR LIVRO"
      title={`Excluir “${target.title}”?`}
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" disabled={busy || !confirmed} onClick={() => void submit()}>
            {busy ? "Excluindo…" : "Excluir livro"}
          </Button>
        </>
      }
    >
      <Callout tone="danger" title="Não há como desfazer">
        {contents ? describe(contents) : "Levantando o que existe dentro…"} Isso sai do banco e do
        disco — e a lixeira não alcança livro, só nó e questão. O único caminho de volta é um
        backup .lbb feito antes.
      </Callout>

      <div style={{ marginTop: "var(--space-4)" }}>
        <Field
          label="Digite o título do livro para confirmar"
          hint={target.title}
          {...(error ? { error } : {})}
        >
          <Input
            autoFocus
            value={typed}
            placeholder={target.title}
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
 * “Vão junto 148 questões, 41 recortes de origem e 9 arquivos.” — só o que for maior que zero.
 *
 * Os recortes contam separado das questões de propósito: são a **evidência** de onde cada questão
 * veio (D29), e é o que menos se refaz — texto dá para redigitar, a página recortada do livro não.
 */
function describe(contents: Contents): string {
  const partes = [
    plural(contents.questionCount, "questão", "questões"),
    plural(contents.anchorCount, "recorte de origem", "recortes de origem"),
    plural(contents.assetCount, "arquivo", "arquivos"),
  ].filter((parte): parte is string => parte !== null);

  if (partes.length === 0) return "O livro está vazio.";
  if (partes.length === 1) return `Vai junto ${partes[0]}.`;

  return `Vão junto ${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}.`;
}

const plural = (n: number, um: string, muitos: string): string | null =>
  n === 0 ? null : `${n} ${n === 1 ? um : muitos}`;
