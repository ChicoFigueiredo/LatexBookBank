"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Field, Input, Modal } from "@/design-system";

/**
 * Criar biblioteca — formulário enxuto, dois campos e nenhum wizard (design §4).
 *
 * O erro do servidor vira **texto no campo**, não banner: o problema é do nome, e é no nome que a
 * correção acontece. Um banner no topo obriga a subir os olhos, entender e voltar.
 */

export interface CreateLibraryDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Depois de criar. Sem isto a tela navega para a biblioteca nova. */
  readonly onCreated?: (library: { id: string; name: string; slug: string }) => void;
}

export function CreateLibraryDialog({ open, onClose, onCreated }: CreateLibraryDialogProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    // Fechar limpa: reabrir com o erro de outra tentativa pendurado faria parecer que o campo
    // vazio já está errado.
    setName("");
    setError(null);
    onClose();
  };

  const submit = async () => {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/libraries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const payload = (await response.json()) as {
        library?: { id: string; name: string; slug: string };
        message?: string;
      };

      if (!response.ok || !payload.library) {
        setError(payload.message ?? "Não deu para criar a biblioteca.");
        return;
      }

      const library = payload.library;
      setName("");
      onClose();

      if (onCreated) onCreated(library);
      else router.push(`/bibliotecas/${library.slug}`);
      router.refresh();
    } catch {
      setError("Não deu para falar com o servidor.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      eyebrow="ACERVO"
      title="Criar biblioteca"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            disabled={busy || name.trim() === ""}
            onClick={() => void submit()}
          >
            {busy ? "Criando…" : "Criar biblioteca"}
          </Button>
        </>
      }
    >
      <p style={{ margin: "0 0 var(--space-4)", color: "var(--text-secondary)" }}>
        Uma biblioteca reúne livros, questões e recortes. Dá para criar outras depois.
      </p>

      <Field
        label="Nome"
        hint="Como “Matemática do Ensino Médio” ou “Concursos”."
        {...(error ? { error } : {})}
      >
        <Input
          autoFocus
          value={name}
          placeholder="Nome da biblioteca"
          onChange={(event) => {
            setName(event.target.value);
            // O erro é sobre o texto anterior. Mantê-lo enquanto se digita a correção faria a
            // tela contradizer o que está na tela.
            if (error) setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && name.trim() !== "" && !busy) void submit();
          }}
        />
      </Field>
    </Modal>
  );
}
