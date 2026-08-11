"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Banner, Button, Callout, Field, Input, PageHeader, Select } from "@/design-system";
import { isContainerKind } from "@modules/document-tree/domain/add-placement";
import type { NodeKind } from "@modules/document-tree/domain/node-kind";
import { CREATABLE_TYPES } from "@modules/questions/domain/question-blueprint";
import type { QuestionType } from "@modules/questions/domain/question-type";
import {
  IngestionPanel,
  type AcceptedRecognition,
} from "@modules/recognition/ui/IngestionPanel";

/**
 * Captura → revisão → **questão persistida**.
 *
 * O que esta tela fazia antes: guardava o LaTeX conferido numa lista com o recado "cole na
 * questão". Copiar e colar entre telas internas do próprio produto é o que a §2 do prompt lista
 * como inaceitável — e era onde a revisão se perdia num recarregamento de página.
 *
 * O destino é escolhido **na revisão** e não antes (design §14): quando o recorte acabou de ser
 * lido, quem está revisando ainda não decidiu em qual grupo aquilo entra.
 */

export interface IngestionNode {
  readonly id: string;
  readonly title: string;
  readonly kind: NodeKind;
  readonly depth: number;
}

export interface IngestionScreenProps {
  readonly publicationId: string;
  readonly workspaceId: string;
  readonly title: string;
  readonly nodes: readonly IngestionNode[];
}

/**
 * O vocabulário do design, para os tipos que o Beta oferece.
 *
 * `Partial` e não `Record` completo: os quatro tipos legados sem plugin não aparecem em
 * `CREATABLE_TYPES`, e declará-los aqui só para satisfazer o tipo criaria rótulos para opções que
 * a tela nunca mostra — a primeira coisa a divergir quando um deles entrar de verdade.
 */
const TYPE_LABELS: Partial<Record<QuestionType, string>> = {
  MULTIPLE_CHOICE: "Escolha simples",
  MULTIPLE_CORRECT: "Múltipla escolha",
  DISCURSIVE: "Discursiva",
};

interface CreatedInfo {
  readonly href: string;
  readonly warnings: readonly string[];
}

export function IngestionScreen({
  publicationId,
  workspaceId,
  title,
  nodes,
}: IngestionScreenProps) {
  const router = useRouter();

  const destinations = nodes.filter((node) => isContainerKind(node.kind));

  const [accepted, setAccepted] = useState<AcceptedRecognition | null>(null);
  const [destination, setDestination] = useState<string>(destinations[0]?.id ?? "");
  const [type, setType] = useState<QuestionType>("MULTIPLE_CHOICE");
  const [originalLabel, setOriginalLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedInfo | null>(null);
  const [count, setCount] = useState(0);

  const create = async (andContinue: boolean) => {
    if (accepted === null) return;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/publications/${publicationId}/questions/from-recognition`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type,
          // Sem contêiner na árvore, a questão entra na raiz da publicação: um livro sem estrutura
          // é caso normal no começo, e obrigar a criar um capítulo antes de capturar seria pedir
          // decisão editorial de quem só quer transcrever a primeira questão.
          placement:
            destination === ""
              ? { kind: "lastChild", parentId: null }
              : { kind: "lastChild", parentId: destination },
          reviewed: true,
          anchorId: accepted.anchorId,
          cropAssetId: accepted.cropAssetId,
          statementLatex: accepted.statementLatex,
          originalLabel: originalLabel.trim() === "" ? null : originalLabel,
          run: accepted.run,
        }),
      });

      const payload = (await response.json()) as {
        href?: string;
        warnings?: string[];
        message?: string;
      };

      if (!response.ok || !payload.href) {
        // O candidato **fica na tela** (§24): falhar em criar não pode custar a revisão já feita.
        setError(payload.message ?? "Não deu para criar a questão.");
        return;
      }

      setCount((current) => current + 1);
      setOriginalLabel("");

      if (andContinue) {
        // "Criar e continuar capturando": o candidato sai, a tela de captura volta limpa, e o
        // destino escolhido permanece — é o CTA de produtividade do design §14.
        setAccepted(null);
        setCreated(null);
        router.refresh();
        return;
      }

      setCreated({ href: payload.href, warnings: payload.warnings ?? [] });
    } catch {
      setError("Não deu para falar com o servidor.");
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <main style={{ display: "grid", gap: "var(--space-3)" }}>
        <PageHeader eyebrow="CAPTURA" title={title} />
        <div style={{ padding: "0 var(--space-4)" }}>
          <Callout tone="ok" title="Questão criada">
            A questão está no acervo, com o recorte ligado à origem.
            {created.warnings.length > 0 && (
              <ul style={{ margin: "8px 0 0", paddingLeft: "1.2rem" }}>
                {created.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
          </Callout>

          <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-4)" }}>
            <Button variant="primary" icon="pencil" href={created.href}>
              Abrir no editor
            </Button>
            <Button
              variant="secondary"
              icon="scan-text"
              onClick={() => {
                setCreated(null);
                setAccepted(null);
              }}
            >
              Capturar outra
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={{ display: "grid", gap: "var(--space-3)" }}>
      <PageHeader
        eyebrow="CAPTURA"
        title={title}
        meta="Suba um PDF ou imagem, recorte a questão, confira o LaTeX e crie a questão."
        {...(count > 0
          ? { actions: <span style={{ color: "var(--text-secondary)" }}>{count} criada(s) nesta sessão</span> }
          : {})}
      />

      <IngestionPanel
        workspaceId={workspaceId}
        publicationId={publicationId}
        onAccept={setAccepted}
      />

      {accepted && (
        <div style={{ padding: "0 var(--space-4) var(--space-4)" }}>
          <Callout tone="info" title="Conferido — falta dizer onde entra">
            O reconhecimento ainda **não** mexeu no acervo. Ele vira questão quando você criar.
          </Callout>

          {error && (
            <div style={{ marginTop: "var(--space-3)" }}>
              <Banner tone="danger" title="Não deu para criar" onDismiss={() => setError(null)}>
                {error} O recorte e o texto conferido continuam aqui.
              </Banner>
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(12rem, 1fr))",
              gap: "var(--space-3)",
              marginTop: "var(--space-4)",
            }}
          >
            <Field label="Criar questão em">
              <Select value={destination} onChange={(event) => setDestination(event.target.value)}>
                <option value="">{title} (raiz)</option>
                {destinations.map((node) => (
                  <option key={node.id} value={node.id}>
                    {`${"— ".repeat(node.depth)}${node.title}`}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Tipo">
              <Select
                value={type}
                onChange={(event) => setType(event.target.value as QuestionType)}
              >
                {CREATABLE_TYPES.map((entry) => (
                  <option key={entry} value={entry}>
                    {TYPE_LABELS[entry] ?? entry}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Número no livro" optional hint="Como aparece na página: 27, II, 3a.">
              <Input
                value={originalLabel}
                onChange={(event) => setOriginalLabel(event.target.value)}
              />
            </Field>
          </div>

          <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-4)" }}>
            <Button variant="primary" loading={busy} onClick={() => void create(false)}>
              Criar questão
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => void create(true)}>
              Criar e continuar capturando
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setAccepted(null)}>
              Descartar
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
