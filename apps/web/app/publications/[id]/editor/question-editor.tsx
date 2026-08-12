"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Badge, Banner, Button, Field, Select, Tabs } from "@/design-system";
import {
  diffSnapshots,
  type RevisionChange,
  type RevisionSnapshot,
} from "@modules/questions/domain/revision-diff";
import { HistoryPanel, type RevisionRow } from "@modules/questions/ui/HistoryPanel";
import { figureSnippet } from "@modules/assets/domain/asset-ingestion";
import type { Provenance } from "@modules/assets/domain/provenance";
import { OriginPanel } from "@modules/assets/ui/OriginPanel";
import type { QuestionMetadata } from "@modules/questions/domain/question-metadata";
import { MetadataPanel } from "@modules/questions/ui/MetadataPanel";
import { ValidationPane } from "@modules/questions/ui/ValidationPane";
import { QUESTION_FIELDS, type QuestionFieldId } from "@modules/latex/domain/latex-language";
import type { QuestionType } from "@modules/questions/domain/question-type";

import { OptionsPane } from "./options-pane";
import { TagsPane } from "./tags-pane";
import {
  LatexEditor,
  type EditorMarker,
  type EditorSelection,
  type LatexEditorApi,
} from "@modules/latex/ui/LatexEditor";
import { locateBodyLine } from "@modules/rendering/domain/build-render-bundle";
import type { DiagnosticTarget } from "@modules/rendering/ui/RenderPanel";
import { withSelectionInFirstPlaceholder } from "@modules/latex-knowledge/domain/snippet-completion";
import { SymbolPalette } from "@modules/latex-knowledge/ui/SymbolPalette";
import { PreviewPane } from "@modules/preview/ui/PreviewPane";
import { RenderPanel } from "@modules/rendering/ui/RenderPanel";
import type { SaidaDoRender } from "@modules/rendering/domain/saida-do-render";
import { useRender } from "@modules/rendering/ui/use-render";

/**
 * O editor da questão: abas por campo, autosave com debounce e conflito visível.
 *
 * O `updatedAt` é a moeda do salvamento — vai em toda requisição e volta em toda resposta. Quando
 * o servidor recusa com 409, o editor **para de salvar** e mostra o aviso: continuar tentando
 * transformaria uma recusa numa insistência que acabaria vencendo.
 */

const AUTOSAVE_DELAY_MS = 1200;

/**
 * De quanto em quanto tempo o autosave insiste depois de uma falha (protótipo, 706–712).
 *
 * Sem isto o autosave desistia calado. O `catch` marcava `error`, um selo de três letras acendia
 * num canto da barra de abas, e **nada mais acontecia**: a próxima tecla digitada reagendava o
 * salvamento, então quem continuava escrevendo se recuperava sozinho e nunca via o problema. Quem
 * terminava o parágrafo e parava — que é o caso normal de quem acabou de escrever alguma coisa —
 * ficava com o texto só na tela, e fechava a aba com ele.
 *
 * Trinta segundos é o número do protótipo, e é o certo: rápido para recuperar um blip de rede sem
 * intervenção, lento para não martelar um servidor que já está fora.
 */
const RETRY_DELAY_MS = 30_000;

type SaveState = "idle" | "dirty" | "saving" | "saved" | "conflict" | "error";

/** Alternativas, só para o preview: quem as edita é a Fase 7. */
export interface QuestionEditorOption {
  readonly statementLatex: string;
  readonly isCorrect: boolean;
}

/** As três respostas para "como isto está?": aproximada, autoritativa e histórica. */
type RightTab = "rapido" | "render" | "validacao" | "historico" | "origem";

/**
 * O que ocupa o centro: um campo de texto, as alternativas ou os metadados.
 *
 * Uma tira de abas só, e não duas: para quem edita, "Resposta" e "Alternativas" são o mesmo tipo
 * de escolha — que parte da questão estou mexendo agora. Separá-las em faixas diferentes pediria
 * que a pessoa aprendesse uma taxonomia nossa antes de achar o gabarito.
 */
const EXTRA_PANES = [
  { id: "options", label: "Alternativas" },
  { id: "metadata", label: "Metadados" },
  { id: "tags", label: "Tags" },
] as const;

/**
 * A discursiva **não** mostra aba de alternativas.
 *
 * Não é que estejam faltando — é que não existem (design §10). Uma aba que abre numa lista vazia
 * com um botão "Adicionar" convida a criar alternativa em questão que não tem, e o resultado é o
 * aviso `discursive_has_options` que a validação teria de explicar depois.
 */
const panesFor = (type: QuestionType) =>
  type === "DISCURSIVE" ? EXTRA_PANES.filter((entry) => entry.id !== "options") : EXTRA_PANES;

type Pane = QuestionFieldId | (typeof EXTRA_PANES)[number]["id"];

const isField = (pane: Pane): pane is QuestionFieldId =>
  QUESTION_FIELDS.some((entry) => entry.id === pane);

export interface QuestionEditorProps {
  readonly publicationId: string;
  /** O workspace dono. A tag é por workspace, e o autocomplete precisa saber de qual. */
  readonly workspaceId: string;
  readonly questionId: string;
  /** O tipo da questão. Decide se o gabarito é exclusivo e se há aba de alternativas. */
  readonly questionType: QuestionType;
  /**
   * Trocar o tipo. Ausente quando quem monta o editor não sabe recarregar a árvore depois.
   *
   * A troca muda a **forma** da questão — some ou volta uma aba inteira —, e por isso não é um
   * campo qualquer do autosave: quem chamou precisa recarregar para a árvore e o painel voltarem
   * coerentes com o tipo novo.
   */
  readonly onTypeChange?: (type: QuestionType) => void;
  readonly initial: Readonly<Record<QuestionFieldId, string>>;
  readonly initialVersion: string;
  readonly options?: readonly QuestionEditorOption[];
  /**
   * Anexa o trecho selecionado ao contexto do agente (Fase 8).
   *
   * O gesto mora aqui e não no painel porque quem sabe o que está selecionado é o editor — e o
   * painel, de propósito, não tem acesso ao documento. Ausente quando não há IA configurada.
   */
  readonly onAttachSelection?: (selection: EditorSelection) => void;
  /**
   * Avisa quem está fora que **esta** questão tem alteração pendente.
   *
   * Sobe em vez de a árvore adivinhar: só o editor sabe que há texto digitado que ainda não foi
   * ao servidor, e esse é o único estado que se perde ao clicar em outro nó.
   */
  readonly onDirtyChange?: (questionId: string | null) => void;
}

export function QuestionEditor({
  publicationId,
  workspaceId,
  questionId,
  questionType,
  onTypeChange,
  initial,
  initialVersion,
  options = [],
  onAttachSelection,
  onDirtyChange,
}: QuestionEditorProps) {
  const [pane, setPane] = useState<Pane>("statementLatex");
  // O campo de texto que o editor mostra. Ele **não** muda quando a pessoa vai para Alternativas:
  // voltar para "Conteúdo" e encontrar outra aba aberta seria perder o lugar sem motivo.
  const [field, setField] = useState<QuestionFieldId>("statementLatex");
  const [draft, setDraft] = useState<Record<QuestionFieldId, string>>({ ...initial });
  const [state, setState] = useState<SaveState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [rightTab, setRightTab] = useState<RightTab>("rapido");

  /**
   * O histórico é carregado **ao abrir a aba**, não junto com a questão.
   *
   * Uma questão editada cem vezes tem cem revisões, e trazê-las com o editor faria toda abertura
   * pagar por uma tela que quase nunca se abre.
   */
  const [revisions, setRevisions] = useState<readonly RevisionRow[] | null>(null);
  const [selectedRevision, setSelectedRevision] = useState<number | null>(null);
  const [revisionChanges, setRevisionChanges] = useState<readonly RevisionChange[] | null>(null);

  /**
   * Os metadados, carregados ao abrir a aba.
   *
   * Mesmo motivo do histórico: o DTO da árvore leva a dificuldade e a origem já formatadas, que é
   * o que a lista desenha. Os campos crus só interessam a quem vai editá-los.
   */
  const [metadata, setMetadata] = useState<QuestionMetadata | null>(null);
  const metadataRef = useRef<QuestionMetadata | null>(null);

  const loadMetadata = useCallback(async () => {
    const response = await fetch(`/api/publications/${publicationId}/questions/${questionId}`);
    const payload = (await response.json()) as { metadata?: QuestionMetadata };
    if (payload.metadata === undefined) return;

    setMetadata(payload.metadata);
    metadataRef.current = payload.metadata;
  }, [publicationId, questionId]);

  const loadHistory = useCallback(async () => {
    const response = await fetch(`/api/questions/${questionId}/revisions`);
    const payload = (await response.json()) as { revisions?: RevisionRow[] };
    setRevisions(payload.revisions ?? []);
  }, [questionId]);

  /** O diff é da revisão contra o **estado atual** — é o que decide se vale restaurar. */
  const selectRevision = useCallback(
    async (revisionNumber: number) => {
      setSelectedRevision(revisionNumber);
      setRevisionChanges(null);

      const response = await fetch(
        `/api/questions/${questionId}/revisions?revision=${revisionNumber}`,
      );
      const payload = (await response.json()) as {
        snapshot?: RevisionSnapshot;
        current?: RevisionSnapshot | null;
      };
      if (!payload.snapshot || !payload.current) return;

      // Os dois lados vêm do servidor. Montar o "atual" a partir do editor mostraria alternativa,
      // metadado e tag como inalterados sempre — bem os campos onde o agente mais mexe.
      setRevisionChanges(
        diffSnapshots(payload.snapshot, {
          ...payload.current,
          // Exceto os três campos de texto, que podem ter edição não salva na tela: usar o valor
          // do banco aqui esconderia do usuário justamente o que ele acabou de digitar.
          statementLatex: draft.statementLatex,
          solutionLatex: draft.solutionLatex,
          complementLatex: draft.complementLatex,
        }),
      );
    },
    [draft, questionId],
  );

  const restoreRevision = useCallback(
    async (revisionNumber: number) => {
      await fetch("/api/agents/patches/revert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ questionId, revisionNumber }),
      });
      // Recarregar em vez de aplicar no estado local: restaurar mexe em alternativas, metadados e
      // tags, que esta tela não guarda — e um estado meio atualizado é pior que um recarregado.
      window.location.reload();
    },
    [questionId],
  );

  // A versão vive em ref, não em state: ela muda a cada gravação e não desenha nada. Em state,
  // cada salvamento re-renderizaria o editor inteiro — e o Monaco perde a posição do cursor.
  const version = useRef(initialVersion);
  const editor = useRef<LatexEditorApi | null>(null);
  const draftRef = useRef(draft);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    onDirtyChange?.(state === "dirty" ? questionId : null);

    // Limpa ao trocar de questão e ao desmontar: sem isto o indicador ficaria preso no nó
    // anterior, apontando "não salva" para uma questão que já foi gravada.
    return () => onDirtyChange?.(null);
  }, [state, questionId, onDirtyChange]);

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
          // Os metadados vão no **mesmo** `PATCH`, com a mesma versão. Um segundo caminho de
          // escrita teria o próprio token de concorrência a comparar, e as duas gravações
          // passariam a se invalidar uma à outra a cada pausa da digitação.
          ...(metadataRef.current ?? {}),
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

  /**
   * Depois de uma falha, insiste — mas só depois de **falha**, nunca depois de conflito.
   *
   * A distinção é a §42: conflito nunca sobrescreve. Insistir num 409 seria o autosave brigando
   * pela versão de quem está com a tela aberta contra quem já gravou, e vencendo por repetição.
   * Falha de rede é o oposto: ninguém gravou nada, e o único risco é o texto ficar para trás.
   */
  useEffect(() => {
    if (state !== "error") return;

    const retry = setTimeout(() => void save(), RETRY_DELAY_MS);
    return () => clearTimeout(retry);
  }, [state, save]);

  /**
   * Editar metadado usa o mesmo autosave do texto.
   *
   * O erro de validação vem do servidor e cai no mesmo `Banner`: o `MetadataPanel` já recusa
   * localmente o que o domínio recusa, e o que passa por ele é o que a rota também aceita.
   */
  const handleMetadata = useCallback(
    (patch: Partial<QuestionMetadata>) => {
      setMetadata((current) => {
        if (current === null) return current;
        const next = { ...current, ...patch };
        metadataRef.current = next;
        return next;
      });
      setState((current) => (current === "conflict" ? current : "dirty"));

      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void save(), AUTOSAVE_DELAY_MS);
    },
    [save],
  );

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

  /*
   * A saída do render — `Aluno` por padrão.
   *
   * Padrão de estado da tela, e não preferência gravada: a escolha vale para a compilação que vem,
   * e uma preferência lembrada faria alguém baixar o PDF com gabarito semanas depois sem lembrar
   * de ter escolhido isso. Ver `saida-do-render`.
   */
  const [saida, setSaida] = useState<SaidaDoRender>("aluno");
  const { status: renderStatus, render } = useRender({ publicationId, questionId, saida });

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

  /**
   * Os diagnósticos do campo aberto, como marcador do Monaco.
   *
   * `info` fica de fora: `Overfull \hbox` aparece às dezenas em documento saudável, e sublinhar
   * tudo isso deixaria o editor rajado de amarelo até ninguém mais olhar — a mesma razão pela qual
   * ele já não entra na lista do painel.
   *
   * E só o campo aberto: a linha 3 do Complemento não é a linha 3 do enunciado, e marcar por
   * número sem olhar o campo é justamente o erro que o mapa do corpo existe para evitar.
   */
  const markers = useMemo<readonly EditorMarker[]>(() => {
    if (renderStatus.kind !== "done") return [];

    const { diagnostics, sourceMap } = renderStatus.outcome;
    if (sourceMap === undefined) return [];

    return diagnostics.flatMap((diagnostic) => {
      if (diagnostic.line === null || diagnostic.severity === "info") return [];

      const at = locateBodyLine(sourceMap, diagnostic.line);
      if (at === null || at.origin !== field) return [];

      return [{ line: at.line, severity: diagnostic.severity, message: diagnostic.message }];
    });
  }, [renderStatus, field]);

  /**
   * A linha esperando o editor.
   *
   * Clicar num diagnóstico pode precisar **trocar de aba** antes de rolar, e nesse instante o
   * editor do campo de destino ainda não existe. A linha fica guardada e é consumida assim que
   * houver editor — pelo efeito, se ele já estava montado, ou pelo `onReady`, se acabou de nascer.
   */
  const pendingLine = useRef<number | null>(null);
  /** Mesmo mecanismo, para o snippet de figura: ele também pode precisar trocar de aba antes. */
  const pendingSnippet = useRef<string | null>(null);
  const [revealTick, setRevealTick] = useState(0);

  const flushReveal = useCallback(() => {
    const snippet = pendingSnippet.current;
    if (snippet !== null) {
      pendingSnippet.current = null;
      editor.current?.insertSnippet(snippet);
    }

    const line = pendingLine.current;
    if (line === null) return;

    pendingLine.current = null;
    editor.current?.revealLine(line);
  }, []);

  useEffect(flushReveal, [flushReveal, revealTick, pane, field]);

  /**
   * "Inserir como figura" — o gesto que faltava.
   *
   * O `figureSnippet` existia desde a Fase 14, testado, e **nada o chamava**: o `OriginPanel`
   * subia a ação e o editor não a escutava. Sexta vez do mesmo padrão neste projeto.
   *
   * O nome do arquivo vem do servidor (`cropLatexName`), e é o mesmo que a rota de render usa para
   * gravar o asset no diretório do job. Inventá-lo aqui daria um `\includegraphics` que aponta
   * para um arquivo que nunca chega — e o `pdflatex` diria "File not found", mandando procurar
   * defeito no texto de quem escreveu.
   */
  const insertFigure = useCallback((provenance: Provenance) => {
    if (provenance.cropLatexName === null) return;

    // O snippet vai para o **conteúdo**: é onde a figura da questão mora. Inserir na aba aberta
    // colocaria uma figura no meio do gabarito se a pessoa estivesse na Resposta.
    setPane("statementLatex");
    setField("statementLatex");

    pendingSnippet.current = figureSnippet({
      assetName: provenance.cropLatexName,
      widthFraction: 0.8,
    });
    setRevealTick((tick) => tick + 1);
  }, []);

  const goToDiagnostic = useCallback((target: DiagnosticTarget) => {
    // As alternativas não são um campo de texto: o destino é a aba, e o "número da linha" ali é o
    // número da alternativa — levar um cursor para lá não significaria nada.
    if (target.field === "options") {
      setPane("options");
      return;
    }

    setPane(target.field);
    setField(target.field);
    pendingLine.current = target.line;
    setRevealTick((tick) => tick + 1);
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
          tabs={[
            ...QUESTION_FIELDS.map((f) => ({ id: f.id, label: f.label })),
            ...panesFor(questionType).map((entry) => ({ id: entry.id, label: entry.label })),
          ]}
          value={pane}
          onChange={(id) => {
            const next = id as Pane;
            setPane(next);
            if (isField(next)) setField(next);
            if (next === "metadata" && metadata === null) void loadMetadata();
          }}
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
          {onAttachSelection && (
            <Button
              size="sm"
              variant="ghost"
              icon="sparkles"
              onClick={() => {
                const selection = editor.current?.getSelection();
                // Sem seleção, dizer isso é melhor que anexar o campo inteiro por conta própria —
                // que é justamente o tipo de dedução que o contexto explícito recusa.
                if (!selection) {
                  setMessage("Selecione um trecho no editor antes de anexar ao agente.");
                  return;
                }
                onAttachSelection(selection);
              }}
            >
              Anexar ao agente
            </Button>
          )}
          <Button size="sm" variant="ghost" disabled={blocked} onClick={() => void save()}>
            Salvar
          </Button>
        </div>
      </div>

      {message && (
        <div style={{ padding: "var(--space-3) var(--space-4) 0" }}>
          <Banner
            tone={blocked ? "warn" : "danger"}
            title={blocked ? "Conflito" : "O salvamento automático falhou"}
            {...(blocked
              ? {}
              : {
                  actions: (
                    <Button size="sm" variant="secondary" onClick={() => void save()}>
                      Tentar agora
                    </Button>
                  ),
                })}
          >
            {message}
            {/*
              A frase do protótipo (709), e ela faz três trabalhos numa linha: diz que o texto não
              se perdeu — que é a primeira pergunta de quem lê "falhou" —, diz que a máquina
              continua tentando, e diz de quanto em quanto tempo. Sem ela, "erro ao salvar" manda
              a pessoa decidir sozinha se copia o texto para um bloco de notas.
            */}
            {blocked
              ? " O autosave está pausado até você recarregar."
              : " O texto continua aqui e nada foi perdido — tentamos de novo a cada 30 s."}
          </Banner>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
          {pane === "options" ? (
            <OptionsPane
              publicationId={publicationId}
              questionId={questionId}
              exclusive={questionType !== "MULTIPLE_CORRECT"}
              disabled={blocked}
            />
          ) : pane === "tags" ? (
            <TagsPane questionId={questionId} workspaceId={workspaceId} disabled={blocked} />
          ) : pane === "metadata" ? (
            metadata === null ? (
              <div style={{ padding: "var(--space-4)" }}>lendo os metadados…</div>
            ) : (
              <div style={{ padding: "var(--space-3)", overflow: "auto", height: "100%" }}>
                {/*
                  O tipo, editável (protótipo, 2226: "o tipo pode mudar depois sem perder
                  conteúdo").

                  Era escolhido na criação e era para sempre, o que fazia o seletor de tipo uma
                  decisão pesada num momento em que a pessoa muitas vezes ainda não leu a questão
                  inteira: na dúvida entre "escolha simples" e "múltipla escolha", errar
                  significava recriar e redigitar.

                  Trocar não apaga nada, e não por generosidade — é o que o app já fazia: a
                  discursiva **esconde** a aba de alternativas em vez de excluí-las, então voltar
                  atrás devolve tudo. Aqui a frase só passou a ser verdade porque o `PATCH` passou
                  a aceitar o campo.
                */}
                <Field
                  label="Tipo da questão"
                  hint="Trocar não apaga nada — as alternativas continuam guardadas, mesmo na discursiva."
                >
                  <Select
                    value={questionType}
                    disabled={blocked}
                    onChange={(event) => onTypeChange?.(event.target.value as QuestionType)}
                  >
                    <option value="MULTIPLE_CHOICE">Escolha simples · uma correta</option>
                    <option value="MULTIPLE_CORRECT">Múltipla escolha · uma ou mais corretas</option>
                    <option value="DISCURSIVE">Discursiva · sem alternativas</option>
                  </Select>
                </Field>

                <div style={{ marginTop: "var(--space-4)" }}>
                  <MetadataPanel metadata={metadata} onChange={handleMetadata} disabled={blocked} />
                </div>
              </div>
            )
          ) : (
            <LatexEditor
              value={draft[field]}
              onChange={handleChange}
              onSave={() => void save()}
              onRender={compile}
              markers={markers}
              onReady={(api) => {
                editor.current = api;
                // O editor pode ter nascido **por causa** do clique no diagnóstico; sem esta
                // chamada a primeira navegação depois de trocar de aba não rolaria para lugar
                // nenhum, e só a segunda funcionaria.
                flushReveal();
              }}
              readOnly={blocked}
              ariaLabel={`Editor LaTeX — ${QUESTION_FIELDS.find((f) => f.id === field)?.label}`}
            />
          )}
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
                  { id: "validacao", label: "Validação" },
                  { id: "historico", label: "Histórico" },
                  { id: "origem", label: "Origem" },
                ]}
                value={rightTab}
                onChange={(id) => {
                  const next = id as RightTab;
                  setRightTab(next);
                  if (next === "historico" && revisions === null) void loadHistory();
                }}
                aria-label="Modo de visualização"
              />
            </div>

            <div style={{ flex: 1, minHeight: 0 }}>
              {rightTab === "origem" ? (
                // A aba estava bloqueada pela Fase 14: a âncora já guardava a página e a caixa,
                // e não havia porta para navegá-las.
                <OriginPanel
                  questionId={questionId}
                  onAction={(action, provenance) => {
                    if (action === "insert-figure") insertFigure(provenance);
                  }}
                />
              ) : rightTab === "validacao" ? (
                <ValidationPane
                  publicationId={publicationId}
                  questionId={questionId}
                  disabled={blocked}
                />
              ) : rightTab === "historico" ? (
                <HistoryPanel
                  revisions={revisions ?? []}
                  changes={revisionChanges}
                  selected={selectedRevision}
                  onSelect={(number) => void selectRevision(number)}
                  onRestore={(number) => void restoreRevision(number)}
                  busy={blocked}
                />
              ) : rightTab === "rapido" ? (
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
                  // A memória do "último render bom" é por questão: trocar de nó precisa esquecê-la.
                  questionKey={questionId}
                  // Só até a primeira compilação: dali em diante a aba Fonte mostra o corpo que o
                  // servidor realmente montou, com as alternativas dentro.
                  sourceLatex={draft.statementLatex}
                  onGoToDiagnostic={goToDiagnostic}
                  saida={saida}
                  onSaidaChange={setSaida}
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
