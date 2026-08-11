"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Banner, Button, IconButton, Modal } from "@/design-system";

/**
 * Apagar uma prova.
 *
 * Existia o gesto de criar e não o de apagar, então toda avaliação montada ficava na lista para
 * sempre — inclusive as de teste. Numa lista de trabalho isso é pior que desordem: ela deixa de
 * dizer quais provas importam.
 *
 * **Duas etapas, e a segunda só aparece quando há o que perder.** Sem variante sorteada, apagar é
 * uma prova de rascunho indo embora e o `Modal` basta. Com variante, o servidor **recusa** com 409
 * e devolve as letras; aí a confirmação passa a dizer, com o número na frente, que o gabarito
 * daquelas provas some junto. Perguntar as duas coisas do mesmo jeito ensinaria a clicar em "sim"
 * sem ler — que é como se perde um gabarito.
 *
 * Ver spec §20 · issue #171.
 */
export function DeleteAssessment({
  assessmentId,
  title,
}: {
  readonly assessmentId: string;
  readonly title: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  /** As variantes que o servidor recusou destruir sem confirmação. */
  const [variants, setVariants] = useState<readonly string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const remove = async (confirmVariants: boolean) => {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/assessments/${assessmentId}${confirmVariants ? "?confirmVariants=1" : ""}`,
        { method: "DELETE" },
      );

      if (response.status === 409) {
        const payload = (await response.json()) as { variantLabels?: string[] };
        // Não é erro: é o servidor pedindo que alguém diga sim sabendo o que perde.
        setVariants(payload.variantLabels ?? []);
        return;
      }

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { message?: string };
        setError(payload.message ?? `Falha ao apagar (HTTP ${response.status}).`);
        return;
      }

      setOpen(false);
      setVariants(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    setOpen(false);
    setVariants(null);
    setError(null);
  };

  return (
    <>
      {/* `circle-x` é o mesmo ícone que a árvore usa para excluir; não há `trash` no set, e
          inventar um aqui daria dois desenhos para o mesmo gesto. */}
      <IconButton
        icon="circle-x"
        aria-label={`Apagar ${title}`}
        variant="danger"
        size="sm"
        onClick={() => setOpen(true)}
      />

      <Modal
        open={open}
        onClose={close}
        title={variants === null ? "Apagar avaliação?" : "Isto apaga o gabarito"}
        // O "não" precisa ser explícito: clicar fora não descarta uma prova.
        closeOnScrim={false}
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={busy}>
              Cancelar
            </Button>
            <Button variant="danger" disabled={busy} onClick={() => void remove(variants !== null)}>
              {variants === null ? "Apagar" : "Apagar mesmo assim"}
            </Button>
          </>
        }
      >
        {error !== null && (
          <Banner tone="danger" title="Não deu">
            {error}
          </Banner>
        )}

        {variants === null ? (
          <p>
            <strong>{title}</strong> sai da lista. As questões continuam no acervo — a prova
            referencia, nunca copia.
          </p>
        ) : (
          <>
            <p>
              <strong>{title}</strong> tem {variants.length} variante(s) sorteada(s)
              {variants.length > 0 && <> ({variants.join(", ")})</>}.
            </p>
            <p>
              O mapa de letras de cada uma <strong>é o gabarito</strong> daquela impressão. Se
              alguma já foi para a sala, apagar aqui deixa a correção sem referência — e a seed
              sozinha não reconstrói, porque ela reproduz o embaralhamento apenas enquanto a questão
              tiver exatamente as mesmas alternativas.
            </p>
          </>
        )}
      </Modal>
    </>
  );
}
