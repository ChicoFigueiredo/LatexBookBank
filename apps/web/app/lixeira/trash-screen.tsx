"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button, Callout, EmptyState, Field, Icon, Input, Modal, type IconName } from "@/design-system";

import { useAcervoStyles } from "../acervo-styles";
import { AppShell } from "../app-shell";

/**
 * A lixeira do acervo (protótipo, 1889–1921).
 *
 * O app já tinha lixeira, e só por dentro do livro. Isso responde "o que apaguei neste livro" e
 * não responde a pergunta que faz alguém procurar a lixeira: "apaguei alguma coisa e não lembro
 * onde". Quem não lembra o livro precisaria abrir os vinte e quatro.
 *
 * Uma linha por **ato de exclusão**, não por linha do banco: excluir um grupo apaga sete nós e é
 * uma decisão só. Cada linha diz o que levou junto, porque é isso que decide se vale restaurar.
 */

export interface TrashItemView {
  readonly id: string;
  readonly publicationId: string;
  readonly title: string;
  readonly kind: string;
  readonly where: string;
  readonly libraryName: string;
  /** Já formatado no servidor: formatar no cliente quebra a hidratação na virada do minuto. */
  readonly deletedLabel: string;
  readonly restoresCount: number;
  readonly took: string | null;
}

export interface TrashScreenProps {
  readonly items: readonly TrashItemView[];
  readonly footer: string;
  readonly objectCount: number;
}

/** Ícone por tipo: estrutura e conteúdo se distinguem de relance, antes de ler a linha. */
const ICONE: Readonly<Record<string, IconName>> = {
  QUESTION: "circle-help",
  QUESTION_GROUP: "list-tree",
  CHAPTER: "book-open",
  SECTION: "list-tree",
  SUBSECTION: "list-tree",
  PART: "book-open",
  FIGURE: "image",
  NOTE: "file-text",
  EXAMPLE: "clipboard-list",
};

export function TrashScreen({ items, footer, objectCount }: TrashScreenProps) {
  useAcervoStyles();
  const router = useRouter();

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emptying, setEmptying] = useState(false);

  const restaurar = async (item: TrashItemView) => {
    setBusy(item.id);
    setError(null);

    try {
      const response = await fetch(
        `/api/publications/${item.publicationId}/nodes/${item.id}/restore`,
        { method: "POST" },
      );

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        setError(payload.message ?? "Não deu para restaurar.");
        return;
      }

      router.refresh();
    } catch {
      setError("Não deu para falar com o servidor.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <AppShell activeModule="lixeira" breadcrumb={[{ label: "Lixeira" }]}>
      <div className="lbb-acervo" style={{ maxWidth: "56rem" }}>
        <div className="lbb-greet">Sistema</div>
        <h1 className="lbb-greet-title">Lixeira</h1>
        <p className="lbb-book-sub" style={{ marginTop: 6, maxWidth: "48rem" }}>
          Excluir um item o manda para cá com tudo o que é dele — alternativas, tags, recorte de
          origem. Nada é apagado de verdade até você esvaziar.
        </p>

        {error && (
          <div style={{ marginTop: "var(--space-4)" }}>
            <Callout tone="danger" title="Não deu">
              {error}
            </Callout>
          </div>
        )}

        {items.length === 0 ? (
          <div style={{ marginTop: "var(--space-6)" }}>
            <EmptyState
              icon="circle-check"
              title="A lixeira está vazia"
              description="Nada foi excluído, ou o que havia já foi restaurado ou apagado de vez."
            />
          </div>
        ) : (
          <div className="lbb-trash" style={{ marginTop: "var(--space-6)" }}>
            {items.map((item) => (
              <div key={item.id} className="lbb-trash-row">
                <Icon name={ICONE[item.kind] ?? "circle-help"} size={15} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="lbb-trash-title">{item.title}</div>
                  {/*
                    O que levou junto entra em `danger` e substitui a linha neutra: é o aviso de
                    que aquelas seis questões só voltam por aqui. Endereço e data continuam, para
                    a decisão não depender de lembrar de qual livro era.
                  */}
                  <div className="lbb-trash-meta" data-tone={item.took ? "danger" : undefined}>
                    {[item.where, item.took, `excluído ${item.deletedLabel}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="secondary"
                  loading={busy === item.id}
                  onClick={() => void restaurar(item)}
                >
                  {/* A promessa é numérica, e o número vem da mesma conta que a restauração usa. */}
                  {item.restoresCount > 1 ? `Restaurar (${item.restoresCount} itens)` : "Restaurar"}
                </Button>
              </div>
            ))}

            <div className="lbb-trash-foot">
              <span className="lbb-source-size">{footer}</span>
              <Button size="sm" variant="danger" onClick={() => setEmptying(true)}>
                Esvaziar lixeira
              </Button>
            </div>
          </div>
        )}
      </div>

      {emptying && (
        <EmptyTrashConfirmation
          objectCount={objectCount}
          onClose={() => setEmptying(false)}
          onEmptied={() => {
            setEmptying(false);
            router.refresh();
          }}
        />
      )}
    </AppShell>
  );
}

/**
 * Esvaziar exige a palavra digitada, pelo mesmo motivo que excluir biblioteca exige o nome.
 *
 * É a única operação do produto sem volta — não há lixeira da lixeira. E os números vêm do
 * servidor no momento da abertura, não da página: entre carregar a lixeira e mandar esvaziar, o
 * usuário pode ter restaurado metade dela, e um aviso que mente por desatualização é pior que
 * aviso nenhum.
 */
const PALAVRA = "ESVAZIAR";

function EmptyTrashConfirmation({
  objectCount,
  onClose,
  onEmptied,
}: {
  readonly objectCount: number;
  readonly onClose: () => void;
  readonly onEmptied: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agora, setAgora] = useState<number | null>(null);

  // O número do servidor no momento da abertura, com o da página como base enquanto ele não chega.
  // Sem isso o aviso fica preso ao carregamento da tela e mente depois de qualquer restauração.
  useEffect(() => {
    let atual = true;

    void (async () => {
      try {
        const response = await fetch("/api/trash");
        const payload = (await response.json()) as { objectCount?: number };
        if (atual && typeof payload.objectCount === "number") setAgora(payload.objectCount);
      } catch {
        // Sem o número fresco o diálogo ainda funciona com o da página — só fica menos informado.
      }
    })();

    return () => {
      atual = false;
    };
  }, []);

  const total = agora ?? objectCount;
  const confirmado = typed.trim().toUpperCase() === PALAVRA;
  const aviso =
    total === 0
      ? "A lixeira já está vazia — não há o que apagar."
      : total === 1
        ? "1 objeto sai do banco, com a questão e tudo o que é dela."
        : `${total} objetos saem do banco, com as questões e tudo o que é delas.`;

  const esvaziar = async () => {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/trash", { method: "DELETE" });
      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        setError(payload.message ?? "Não deu para esvaziar.");
        return;
      }

      onEmptied();
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
      closeOnScrim={false}
      eyebrow="ESVAZIAR"
      title="Esvaziar a lixeira?"
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            disabled={busy || confirmado !== true}
            onClick={() => void esvaziar()}
          >
            {busy ? "Apagando…" : "Apagar de vez"}
          </Button>
        </>
      }
    >
      <Callout tone="danger" title="Não há lixeira da lixeira">
        {aviso} Os recortes de origem no PDF
        ficam — eles são a proveniência, e podem pertencer a questões que continuam vivas.
      </Callout>

      <div style={{ marginTop: "var(--space-4)" }}>
        <Field
          label="Digite a palavra para confirmar"
          // A palavra no hint e não no rótulo, como em excluir biblioteca: embutida na frase ela
          // vira leitura corrida, e é justamente o que precisa ser copiado com exatidão.
          hint={PALAVRA}
          {...(error ? { error } : {})}
        >
          <Input
            autoFocus
            value={typed}
            placeholder={PALAVRA}
            onChange={(event) => {
              setTyped(event.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && confirmado && !busy) void esvaziar();
            }}
          />
        </Field>
      </div>
    </Modal>
  );
}
