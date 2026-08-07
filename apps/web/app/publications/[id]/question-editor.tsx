"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Badge, Banner, Button, Tabs } from "@/design-system";
import { QUESTION_FIELDS, type QuestionFieldId } from "@modules/latex/domain/latex-language";
import { LatexEditor } from "@modules/latex/ui/LatexEditor";

/**
 * O editor da questão: abas por campo, autosave com debounce e conflito visível.
 *
 * O `updatedAt` é a moeda do salvamento — vai em toda requisição e volta em toda resposta. Quando
 * o servidor recusa com 409, o editor **para de salvar** e mostra o aviso: continuar tentando
 * transformaria uma recusa numa insistência que acabaria vencendo.
 */

const AUTOSAVE_DELAY_MS = 1200;

type SaveState = "idle" | "dirty" | "saving" | "saved" | "conflict" | "error";

export interface QuestionEditorProps {
  readonly publicationId: string;
  readonly questionId: string;
  readonly initial: Readonly<Record<QuestionFieldId, string>>;
  readonly initialVersion: string;
}

export function QuestionEditor({
  publicationId,
  questionId,
  initial,
  initialVersion,
}: QuestionEditorProps) {
  const [field, setField] = useState<QuestionFieldId>("statementLatex");
  const [draft, setDraft] = useState<Record<QuestionFieldId, string>>({ ...initial });
  const [state, setState] = useState<SaveState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  // A versão vive em ref, não em state: ela muda a cada gravação e não desenha nada. Em state,
  // cada salvamento re-renderizaria o editor inteiro — e o Monaco perde a posição do cursor.
  const version = useRef(initialVersion);
  const draftRef = useRef(draft);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const save = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setState("saving");

    try {
      const response = await fetch(`/api/publications/${publicationId}/questions/${questionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedVersion: version.current,
          ...draftRef.current,
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      const read = (key: string): string | undefined => {
        if (typeof payload !== "object" || payload === null || !(key in payload)) return undefined;
        const value = (payload as Record<string, unknown>)[key];
        return typeof value === "string" ? value : undefined;
      };

      if (response.status === 409) {
        // Sem `setState("conflict")` o autosave voltaria a disparar em 1,2 s e insistiria até
        // vencer. Parar é o comportamento: a spec §42 diz que conflito nunca sobrescreve.
        setState("conflict");
        setMessage(read("message") ?? "Esta questão mudou desde que você abriu.");
        return;
      }

      if (!response.ok) {
        setState("error");
        setMessage(read("message") ?? `Falha ao salvar (status ${response.status}).`);
        return;
      }

      const next = read("version");
      if (next) version.current = next;
      setState("saved");
      setMessage(null);
    } catch {
      setState("error");
      setMessage("Não foi possível falar com o servidor. O texto continua aqui.");
    }
  }, [publicationId, questionId]);

  const handleChange = useCallback(
    (value: string) => {
      setDraft((current) => ({ ...current, [field]: value }));
      setState((current) => (current === "conflict" ? current : "dirty"));

      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void save(), AUTOSAVE_DELAY_MS);
    },
    [field, save],
  );

  // Um debounce pendente na desmontagem gravaria uma questão que não está mais aberta.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const blocked = state === "conflict";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-3)",
          padding: "0 var(--space-4)",
          borderBottom: "1px solid var(--border-default)",
        }}
      >
        <Tabs
          tabs={QUESTION_FIELDS.map((f) => ({ id: f.id, label: f.label }))}
          value={field}
          onChange={(id) => setField(id as QuestionFieldId)}
          aria-label="Campos da questão"
        />
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <SaveIndicator state={state} />
          <Button size="sm" variant="ghost" disabled={blocked} onClick={() => void save()}>
            Salvar
          </Button>
        </div>
      </div>

      {message && (
        <div style={{ padding: "var(--space-3) var(--space-4) 0" }}>
          <Banner
            tone={blocked ? "warn" : "danger"}
            title={blocked ? "Conflito" : "Erro ao salvar"}
          >
            {message}
            {blocked && " O autosave está pausado até você recarregar."}
          </Banner>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0 }}>
        <LatexEditor
          value={draft[field]}
          onChange={handleChange}
          onSave={() => void save()}
          readOnly={blocked}
          ariaLabel={`Editor LaTeX — ${QUESTION_FIELDS.find((f) => f.id === field)?.label}`}
        />
      </div>
    </div>
  );
}

/**
 * O estado do salvamento, em palavras.
 *
 * "Salvo" não é o estado de repouso: depois de alguns segundos a informação útil é que **não há
 * nada pendente**, e um selo verde permanente vira decoração que ninguém mais lê.
 */
function SaveIndicator({ state }: { readonly state: SaveState }) {
  switch (state) {
    case "dirty":
      return <Badge tone="warn">não salvo</Badge>;
    case "saving":
      return <Badge tone="info">salvando…</Badge>;
    case "saved":
      return <Badge tone="ok">salvo</Badge>;
    case "conflict":
      return <Badge tone="warn">conflito</Badge>;
    case "error":
      return <Badge tone="danger">erro</Badge>;
    default:
      return null;
  }
}
