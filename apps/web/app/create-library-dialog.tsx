"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button, Callout, Field, Input, Modal } from "@/design-system";
import { slugifyLibrary } from "@modules/workspaces/domain/library";

/**
 * Criar biblioteca — dois passos no mesmo diálogo (protótipo do Beta Editorial, 2230–2297).
 *
 * O segundo passo é o que o protótipo acrescenta e vale mais: salvar não despeja o usuário numa
 * biblioteca vazia sem dizer o que fazer ali. Ele pergunta — trazer o primeiro livro, importar do
 * Calibre, ou só abrir. A biblioteca vazia é o estado mais provável logo depois de criar, e é
 * exatamente onde a tela não pode ficar muda.
 *
 * O erro do servidor vira **texto no campo**, não banner: o problema é do nome, e é no nome que a
 * correção acontece.
 */

export interface CreateLibraryDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Depois de criar. Sem isto o diálogo mostra os próximos passos e deixa o usuário escolher. */
  readonly onCreated?: (library: CreatedLibrary) => void;
}

interface CreatedLibrary {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
}

export function CreateLibraryDialog({ open, onClose, onCreated }: CreateLibraryDialogProps) {
  if (!open) return null;

  return <CreateLibraryFlow onClose={onClose} {...(onCreated ? { onCreated } : {})} />;
}

function CreateLibraryFlow({
  onClose,
  onCreated,
}: {
  readonly onClose: () => void;
  readonly onCreated?: (library: CreatedLibrary) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreatedLibrary | null>(null);
  const [takenSlugs, setTakenSlugs] = useState<readonly string[]>([]);

  /**
   * Os nomes já usados, para o aviso de repetição.
   *
   * A comparação é a **mesma** do servidor — `slugifyLibrary`, que ignora caixa e acento —, então o
   * aviso não diverge do que o banco enxerga. Buscar a lista uma vez ao abrir custa uma consulta e
   * evita um endpoint novo só para responder "esse nome existe?".
   */
  useEffect(() => {
    let current = true;

    void (async () => {
      try {
        const response = await fetch("/api/libraries");
        const payload = (await response.json()) as { libraries?: { name: string }[] };
        if (current) setTakenSlugs((payload.libraries ?? []).map((row) => slugifyLibrary(row.name)));
      } catch {
        // Sem a lista o diálogo só deixa de avisar sobre repetição. Não é motivo para travar.
      }
    })();

    return () => {
      current = false;
    };
  }, []);

  const trimmed = name.trim();
  const duplicate = trimmed !== "" && takenSlugs.includes(slugifyLibrary(trimmed));
  const tooShort = trimmed !== "" && trimmed.length < 3;

  const submit = async () => {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/libraries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      const payload = (await response.json()) as {
        library?: CreatedLibrary;
        message?: string;
      };

      if (!response.ok || !payload.library) {
        setError(payload.message ?? "Não deu para criar a biblioteca.");
        return;
      }

      // A lista da Home fica velha no instante em que a biblioteca nasce. Atualizar já, e não ao
      // fechar, é o que faz "Abrir biblioteca" chegar numa tela que já sabe da novidade.
      router.refresh();

      if (onCreated) {
        onCreated(payload.library);
        onClose();
        return;
      }

      setCreated(payload.library);
    } catch {
      setError("Não deu para falar com o servidor.");
    } finally {
      setBusy(false);
    }
  };

  if (created) return <CreatedStep library={created} onClose={onClose} />;

  return (
    <Modal
      open
      // Enquanto o POST está no ar, Escape não fecha: o pedido já partiu.
      {...(busy ? {} : { onClose })}
      eyebrow="NOVO CONTÊINER EDITORIAL"
      title="Criar biblioteca"
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={busy || trimmed === ""} onClick={() => void submit()}>
            {busy ? "Criando…" : "Criar biblioteca"}
          </Button>
        </>
      }
    >
      <p style={{ margin: "0 0 var(--space-4)", color: "var(--text-secondary)" }}>
        Uma biblioteca guarda livros e o acervo de questões deles.
      </p>

      <Field
        label="Nome"
        hint="Use pelo menos 3 caracteres — o nome aparece na busca e no arquivo exportado."
        {...(error ? { error } : {})}
      >
        <Input
          autoFocus
          value={name}
          placeholder="Livros de Matemática"
          onChange={(event) => {
            setName(event.target.value);
            // O erro é sobre o texto anterior. Mantê-lo enquanto se digita a correção faria a
            // tela contradizer o que está na tela.
            if (error) setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && trimmed !== "" && !busy) void submit();
          }}
        />
      </Field>

      {/* Aviso, não bloqueio: quem tem o mesmo acervo em duas máquinas tem motivo para repetir. */}
      {duplicate && (
        <div style={{ marginTop: "var(--space-3)" }}>
          <Callout tone="warn">
            Já existe uma biblioteca com esse nome. Você pode criar assim mesmo — o endereço dela
            recebe um número para as duas continuarem distintas.
          </Callout>
        </div>
      )}

      {tooShort && !duplicate && (
        <div style={{ marginTop: "var(--space-3)" }}>
          <Callout tone="info">
            Nomes muito curtos ficam difíceis de achar na busca depois. Ainda dá para continuar.
          </Callout>
        </div>
      )}

      <div style={{ marginTop: "var(--space-4)" }}>
        <Field label="Descrição" optional hint="Você pode renomear e reescrever depois.">
          <Input
            value={description}
            placeholder="O que esta biblioteca reúne"
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
      </div>

      <div
        style={{
          marginTop: "var(--space-4)",
          paddingTop: "var(--space-3)",
          borderTop: "1px solid var(--border-subtle)",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-meta)",
          color: "var(--text-muted)",
        }}
      >
        fica no seu computador · pode ser exportada como .lbb depois
      </div>
    </Modal>
  );
}

/**
 * O segundo passo — “e agora?”.
 *
 * Três saídas, na ordem de probabilidade: trazer um livro à mão, absorver um do Calibre, ou só
 * abrir a biblioteca. Nenhuma delas é beco: as três levam a telas que existem.
 */
function CreatedStep({
  library,
  onClose,
}: {
  readonly library: CreatedLibrary;
  readonly onClose: () => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      eyebrow="BIBLIOTECA CRIADA"
      title={library.name}
      footer={
        <Button variant="ghost" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      <p style={{ margin: "0 0 var(--space-4)", color: "var(--text-secondary)" }}>
        Ela está vazia. O próximo passo é trazer um livro.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        {/*
          Abre a biblioteca **com o seletor de origem já aberto**. Pular direto para o cadastro
          manual escolheria pelo usuário: o protótipo trata "de onde vem este livro?" como uma
          pergunta própria, e o Calibre costuma ser a resposta.
        */}
        <Button
          variant="primary"
          icon="plus"
          href={`/bibliotecas/${library.slug}?adicionar=1`}
          style={{ justifyContent: "flex-start" }}
        >
          Adicionar primeiro livro
        </Button>
        <Button
          variant="secondary"
          icon="library"
          href={`/bibliotecas/${library.slug}/livros/calibre`}
          style={{ justifyContent: "flex-start" }}
        >
          Importar do Calibre
        </Button>
        <Button
          variant="secondary"
          icon="arrow-right"
          href={`/bibliotecas/${library.slug}`}
          style={{ justifyContent: "flex-start" }}
        >
          Abrir biblioteca
        </Button>
      </div>
    </Modal>
  );
}
