"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button, Field, Input } from "@/design-system";

/**
 * Criar uma prova.
 *
 * Só o título: subtítulo e instruções são do cabeçalho e podem esperar. Pedir tudo antes de
 * existir uma prova é o formulário que faz desistir de começar.
 *
 * Ver spec §20 · issue #143.
 */
export function NewAssessment({ workspaceId }: { readonly workspaceId: string }) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const create = async () => {
    if (title.trim() === "") return;
    setBusy(true);

    try {
      const response = await fetch("/api/assessments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, title }),
      });
      const payload = (await response.json()) as { id?: string };

      if (response.ok && payload.id !== undefined) router.push(`/avaliacoes/${payload.id}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
      <Field label="Nova avaliação">
        <Input
          value={title}
          placeholder="Prova de Matemática Financeira — 1º bimestre"
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            void create();
          }}
        />
      </Field>
      <Button
        variant="primary"
        disabled={busy || title.trim() === ""}
        onClick={() => void create()}
      >
        Criar
      </Button>
    </div>
  );
}
