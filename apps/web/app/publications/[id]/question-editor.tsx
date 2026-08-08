"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Badge, Banner, Button, Tabs } from "@/design-system";
import { QUESTION_FIELDS, type QuestionFieldId } from "@modules/latex/domain/latex-language";
import { LatexEditor, type LatexEditorApi } from "@modules/latex/ui/LatexEditor";
import { withSelectionInFirstPlaceholder } from "@modules/latex-knowledge/domain/snippet-completion";
import { SymbolPalette } from "@modules/latex-knowledge/ui/SymbolPalette";
import { PreviewPane } from "@modules/preview/ui/PreviewPane";
import { RenderPanel } from "@modules/rendering/ui/RenderPanel";
import { useRender } from "@modules/rendering/ui/use-render";

/**
 * O editor da questão: abas por campo, autosave com debounce e conflito visível.
 *
 * O `updatedAt` é a moeda do salvamento — vai em toda requisição e volta em toda resposta. Quando
 * o servidor recusa com 409, o editor **para de salvar** e mostra o aviso: continuar tentando
 * transformaria uma recusa numa insistência que acabaria vencendo.
 */

const AUTOSAVE_DELAY_MS = 1200;

type SaveState = "idle" | "dirty" | "saving" | "saved" | "conflict" | "error";

/** Alternativas, só para o preview: quem as edita é a Fase 7. */
export interface QuestionEditorOption {
  readonly statementLatex: string;
  readonly isCorrect: boolean;
}

export interface QuestionEditorProps {
  readonly publicationId: string;
  readonly questionId: string;
  readonly initial: Readonly<Record<QuestionFieldId, string>>;
  readonly initialVersion: string;
  readonly options?: readonly QuestionEditorOption[];
}

export function QuestionEditor({
  publicationId,
  questionId,
  initial,
  initialVersion,
  options = [],
}: QuestionEditorProps) {
  const [field, setField] = useState<QuestionFieldId>("statementLatex");
  const [draft, setDraft] = useState<Record<QuestionFieldId, string>>({ ...initial });
  const [state, setState] = useState<SaveState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [rightTab, setRightTab] = useState<"rapido" | "render">("rapido");

  // A versão vive em ref, não em state: ela muda a cada gravação e não desenha nada. Em state,
  // cada salvamento re-renderizaria o editor inteiro — e o Monaco perde a posição do cursor.
  const version = useRef(initialVersion);
  const editor = useRef<LatexEditorApi | null>(null);
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

  const { status: renderStatus, render } = useRender({ publicationId, questionId });

  // Compilar troca para a aba do resultado: quem aperta `Ctrl+Enter` quer ver o PDF, e deixar a
  // pessoa na aba do preview rápido faria a compilação parecer que não aconteceu.
  const compile = useCallback(() => {
    setRightTab("render");
    render();
  }, [render]);

  // A palette manda o comando; quem sabe transformá-lo em snippet com a seleção dentro é o
  // domínio. Assim `\\textbf` selecionado vira `\\textbf{palavra}` em vez de perder a palavra.
  const insertSymbol = useCallback((command: string) => {
    editor.current?.insertSnippet(withSelectionInFirstPlaceholder(command));
  }, []);

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
          <Button
            size="sm"
            variant="ghost"
            aria-pressed={paletteOpen}
            onClick={() => setPaletteOpen((open) => !open)}
          >
            Símbolos
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-pressed={previewOpen}
            onClick={() => setPreviewOpen((open) => !open)}
          >
            Preview
          </Button>
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

      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
          <LatexEditor
            value={draft[field]}
            onChange={handleChange}
            onSave={() => void save()}
            onRender={compile}
            onReady={(api) => {
              editor.current = api;
            }}
            readOnly={blocked}
            ariaLabel={`Editor LaTeX — ${QUESTION_FIELDS.find((f) => f.id === field)?.label}`}
          />
        </div>

        {/* O preview divide o centro com o editor (D14/§11). É a metade direita do "Main", e
            fica aberto por padrão porque é o feedback que justifica a fase inteira. */}
        {previewOpen && (
          <div
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              borderLeft: "1px solid var(--border-default)",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: "var(--space-1)",
                padding: "var(--space-2) var(--space-3) 0",
              }}
            >
              {/* Aproximado e autoritativo lado a lado, na mesma coluna: são a mesma pergunta
                  ("como isto vai ficar?") respondida com precisão e custo diferentes. */}
              <Tabs
                tabs={[
                  { id: "rapido", label: "Preview rápido" },
                  { id: "render", label: "PDF compilado" },
                ]}
                value={rightTab}
                onChange={(id) => setRightTab(id as "rapido" | "render")}
                aria-label="Modo de visualização"
              />
            </div>

            <div style={{ flex: 1, minHeight: 0 }}>
              {rightTab === "rapido" ? (
                <PreviewPane
                  source={{
                    statementLatex: draft.statementLatex,
                    solutionLatex: draft.solutionLatex,
                    complementLatex: draft.complementLatex,
                    options,
                  }}
                />
              ) : (
                <RenderPanel
                  status={renderStatus}
                  onRender={compile}
                  sourceLatex={draft.statementLatex}
                />
              )}
            </div>
          </div>
        )}

        {/* Painel, não overlay: a palette é ferramenta de trabalho contínuo, e um popover que
            fecha a cada inserção obrigaria a reabri-lo para cada símbolo de uma equação. */}
        {paletteOpen && (
          <aside
            aria-label="Símbolos LaTeX"
            style={{
              width: 280,
              flexShrink: 0,
              minHeight: 0,
              borderLeft: "1px solid var(--border-default)",
            }}
          >
            <SymbolPalette onInsert={insertSymbol} />
          </aside>
        )}
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
