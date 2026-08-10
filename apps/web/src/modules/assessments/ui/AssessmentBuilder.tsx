"use client";

import { useCallback, useEffect, useState } from "react";

import { Badge, Banner, Button, Field, Input, injectCss } from "@/design-system";
import type { TemplateAudience } from "@modules/assessments/domain/assessment-template";

/**
 * Montar a prova: escolher questões, sortear a variante, ver as três versões.
 *
 * A **seed fica à vista e é editável**. Escondê-la atrás de um sorteio interno tiraria de quem
 * monta a única maneira de repetir a mesma prova amanhã — e reprodutibilidade que ninguém
 * consegue pedir é reprodutibilidade que não existe.
 *
 * O gabarito aparece junto do sorteio, antes de qualquer exportação: é o momento em que dá para
 * perceber que uma questão entrou sem alternativa correta marcada, e o único momento em que isso
 * ainda é barato de corrigir.
 *
 * Ver spec §20 · D9 · issue #143.
 */

const CSS = `
.lbb-asm{display:grid;gap:var(--space-4);padding:var(--space-4)}
.lbb-asm-list{display:grid;gap:6px}
.lbb-asm-item{display:flex;gap:8px;align-items:center;padding:8px;border:1px solid var(--border-subtle);border-radius:var(--radius-md);background:var(--surface-raised)}
.lbb-asm-ex{flex:1;min-width:0;font-family:var(--font-mono);font-size:var(--text-micro);color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lbb-asm-row{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end}
.lbb-asm-key{display:flex;flex-wrap:wrap;gap:6px}
.lbb-asm-tex{width:100%;height:18rem;padding:8px;border:1px solid var(--border-default);border-radius:var(--radius-md);background:var(--surface-sunken);color:var(--text-primary);font-family:var(--font-mono);font-size:var(--text-micro)}
.lbb-asm-tabs{display:flex;gap:6px}
`;

const AUDIENCE_LABELS: Readonly<Record<TemplateAudience, string>> = {
  STUDENT: "Aluno",
  TEACHER: "Professor",
  ANSWER_KEY: "Gabarito",
};

interface ItemRow {
  readonly questionId: string;
  readonly excerpt: string;
  readonly optionCount: number;
  readonly hasCorrect: boolean;
}

interface Detail {
  readonly id: string;
  readonly title: string;
  readonly items: readonly ItemRow[];
}

interface Composed {
  readonly label: string;
  readonly seed: number;
  readonly answers: Readonly<Record<string, string>>;
  readonly latex: Readonly<Record<TemplateAudience, string>>;
}

export interface AssessmentBuilderProps {
  readonly assessmentId: string;
  /** Questões candidatas, vindas da árvore. */
  readonly candidates?: readonly { readonly id: string; readonly title: string }[];
}

export function AssessmentBuilder({ assessmentId, candidates = [] }: AssessmentBuilderProps) {
  injectCss("lbb-asm-css", CSS);

  const [detail, setDetail] = useState<Detail | null>(null);
  const [generation, setGeneration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [label, setLabel] = useState("A");
  const [seed, setSeed] = useState("2026");
  const [composed, setComposed] = useState<Composed | null>(null);
  const [audience, setAudience] = useState<TemplateAudience>("STUDENT");

  useEffect(() => {
    let cancelled = false;

    void fetch(`/api/assessments/${assessmentId}`)
      .then(async (response) => {
        const payload = (await response.json()) as Detail & { message?: string };
        if (cancelled) return;

        if (!response.ok) setError(payload.message ?? "Não deu para ler a avaliação.");
        else setDetail(payload);
      })
      .catch(() => {
        if (!cancelled) setError("Não deu para falar com o servidor.");
      });

    return () => {
      cancelled = true;
    };
  }, [assessmentId, generation]);

  const mutate = useCallback(async (input: RequestInfo, init: RequestInit) => {
    setBusy(true);
    try {
      const response = await fetch(input, init);
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { message?: string };
        setError(payload.message ?? `A alteração não foi aceita (status ${response.status}).`);
        return;
      }
      setError(null);
      setGeneration((current) => current + 1);
    } catch {
      setError("Não deu para falar com o servidor.");
    } finally {
      setBusy(false);
    }
  }, []);

  const compose = async () => {
    setBusy(true);
    try {
      const response = await fetch(`/api/assessments/${assessmentId}/variants`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label, seed: Number(seed) }),
      });
      const payload = (await response.json()) as Composed & { message?: string };

      if (!response.ok) {
        setError(payload.message ?? "Não deu para sortear a variante.");
        setComposed(null);
        return;
      }
      setError(null);
      setComposed(payload);
    } catch {
      setError("Não deu para falar com o servidor.");
    } finally {
      setBusy(false);
    }
  };

  const inProva = new Set(detail?.items.map((item) => item.questionId) ?? []);
  const missingAnswer = (detail?.items ?? []).filter((item) => !item.hasCorrect);

  return (
    <div className="lbb-asm">
      {error !== null && (
        <Banner tone="danger" title="Não deu certo">
          {error}
        </Banner>
      )}

      {missingAnswer.length > 0 && (
        // Antes de imprimir, e não depois: a prova sai mesmo assim, mas o gabarito daquelas
        // questões fica em branco, e descobrir isso na correção é tarde.
        <Banner tone="warn" title={`${missingAnswer.length} questão(ões) sem alternativa correta`}>
          O gabarito delas sairá em branco. Marque a correta antes de imprimir.
        </Banner>
      )}

      <section>
        <h3>Questões da prova ({detail?.items.length ?? 0})</h3>
        <div className="lbb-asm-list">
          {(detail?.items ?? []).map((item, index) => (
            <div key={item.questionId} className="lbb-asm-item">
              <Badge tone="neutral">{index + 1}</Badge>
              <span className="lbb-asm-ex">{item.excerpt || "(sem enunciado)"}</span>
              <span className="lbb-asm-ex">{item.optionCount} alt.</span>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  void mutate(
                    `/api/assessments/${assessmentId}/questions?questionId=${item.questionId}`,
                    { method: "DELETE" },
                  )
                }
              >
                Tirar
              </Button>
            </div>
          ))}
        </div>
      </section>

      {candidates.length > 0 && (
        <section>
          <h3>Acrescentar do acervo</h3>
          <div className="lbb-asm-list">
            {candidates
              .filter((candidate) => !inProva.has(candidate.id))
              .map((candidate) => (
                <div key={candidate.id} className="lbb-asm-item">
                  <span className="lbb-asm-ex">{candidate.title}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      void mutate(`/api/assessments/${assessmentId}/questions`, {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ questionId: candidate.id }),
                      })
                    }
                  >
                    Acrescentar
                  </Button>
                </div>
              ))}
          </div>
        </section>
      )}

      <section className="lbb-asm-row">
        <Field label="Variante" hint="O nome impresso no cabeçalho.">
          <Input value={label} onChange={(event) => setLabel(event.target.value)} />
        </Field>
        <Field label="Seed" hint="A mesma seed dá a mesma prova.">
          <Input
            value={seed}
            inputMode="numeric"
            onChange={(event) => setSeed(event.target.value.replace(/\D/g, ""))}
          />
        </Field>
        <Button
          variant="primary"
          disabled={busy || (detail?.items.length ?? 0) === 0}
          onClick={() => void compose()}
        >
          Sortear e gerar as três versões
        </Button>
      </section>

      {composed !== null && (
        <section>
          <h3>
            Variante {composed.label} · seed {composed.seed}
          </h3>

          <div className="lbb-asm-key">
            {Object.entries(composed.answers).map(([questionId, letter], index) => (
              <Badge key={questionId} tone="accent">
                {index + 1}) {letter}
              </Badge>
            ))}
          </div>

          <div className="lbb-asm-tabs" style={{ marginTop: "var(--space-3)" }}>
            {(Object.keys(AUDIENCE_LABELS) as TemplateAudience[]).map((option) => (
              <Button
                key={option}
                size="sm"
                variant={option === audience ? "primary" : "ghost"}
                aria-pressed={option === audience}
                onClick={() => setAudience(option)}
              >
                {AUDIENCE_LABELS[option]}
              </Button>
            ))}
          </div>

          <textarea
            className="lbb-asm-tex"
            readOnly
            aria-label={`LaTeX — ${AUDIENCE_LABELS[audience]}`}
            value={composed.latex[audience]}
          />
        </section>
      )}
    </div>
  );
}
