"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { QuestionFieldId } from "@modules/latex/domain/latex-language";
import type { QuestionMetadata } from "@modules/questions/domain/question-metadata";

import { questionApi } from "./question-client";

/**
 * O rascunho da questão e o autosave: texto, metadados, versão e conflito.
 *
 * O `updatedAt` é a moeda do salvamento — vai em toda requisição e volta em toda resposta. Quando
 * o servidor recusa com 409, o autosave **para de salvar** e a tela mostra o aviso: continuar
 * tentando transformaria uma recusa numa insistência que acabaria vencendo.
 *
 * Saiu do `QuestionEditor` (ARQ-08 da revisão de 2026-09-23), que fica com abas, colunas e o
 * Monaco. O que a tela desenha a partir daqui é `state` e `message`.
 */

export const AUTOSAVE_DELAY_MS = 1200;

/**
 * De quanto em quanto tempo o autosave insiste depois de uma falha (protótipo, 706–712).
 *
 * Sem isto o autosave desistia calado: quem terminava o parágrafo e parava ficava com o texto só
 * na tela, e fechava a aba com ele. Trinta segundos é o número do protótipo: rápido para
 * recuperar um blip de rede sem intervenção, lento para não martelar um servidor que já está fora.
 */
export const RETRY_DELAY_MS = 30_000;

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "conflict" | "error";

export interface QuestionDraftOptions {
  readonly publicationId: string;
  readonly questionId: string;
  readonly initial: Readonly<Record<QuestionFieldId, string>>;
  readonly initialVersion: string;
  /** Sobe o id da questão enquanto há alteração pendente, e `null` quando não há. */
  readonly onDirtyChange?: ((questionId: string | null) => void) | undefined;
}

export interface QuestionDraft {
  readonly draft: Readonly<Record<QuestionFieldId, string>>;
  readonly state: SaveState;
  readonly message: string | null;
  /** Para a tela dizer algo no mesmo `Banner` (ex.: "selecione um trecho"). */
  readonly setMessage: (message: string | null) => void;
  /** Conflito: o editor fica só leitura até recarregar. */
  readonly blocked: boolean;
  readonly save: () => Promise<void>;
  /** Digitação num campo de texto: atualiza o rascunho e reagenda o autosave. */
  readonly changeField: (field: QuestionFieldId, value: string) => void;
  /** Os metadados crus, ou `null` até a aba pedir. */
  readonly metadata: QuestionMetadata | null;
  readonly loadMetadata: () => Promise<void>;
  /** Editar metadado usa o mesmo autosave do texto, no mesmo `PATCH` e com a mesma versão. */
  readonly changeMetadata: (patch: Partial<QuestionMetadata>) => void;
}

export function useQuestionDraft({
  publicationId,
  questionId,
  initial,
  initialVersion,
  onDirtyChange,
}: QuestionDraftOptions): QuestionDraft {
  const [draft, setDraft] = useState<Record<QuestionFieldId, string>>({ ...initial });
  const [state, setState] = useState<SaveState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  /**
   * Os metadados, carregados ao abrir a aba.
   *
   * O DTO da árvore leva a dificuldade e a origem já formatadas, que é o que a lista desenha. Os
   * campos crus só interessam a quem vai editá-los.
   */
  const [metadata, setMetadata] = useState<QuestionMetadata | null>(null);
  const metadataRef = useRef<QuestionMetadata | null>(null);

  // A versão vive em ref, não em state: ela muda a cada gravação e não desenha nada. Em state,
  // cada salvamento re-renderizaria o editor inteiro — e o Monaco perde a posição do cursor.
  const version = useRef(initialVersion);
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

  const loadMetadata = useCallback(async () => {
    const loaded = await questionApi.metadata(publicationId, questionId);
    if (loaded === null) return;

    setMetadata(loaded);
    metadataRef.current = loaded;
  }, [publicationId, questionId]);

  const save = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setState("saving");

    try {
      const outcome = await questionApi.save(publicationId, questionId, {
        expectedVersion: version.current,
        ...draftRef.current,
        // Os metadados vão no **mesmo** `PATCH`, com a mesma versão. Um segundo caminho de
        // escrita teria o próprio token de concorrência a comparar, e as duas gravações
        // passariam a se invalidar uma à outra a cada pausa da digitação.
        ...(metadataRef.current ?? {}),
      });

      if (outcome.kind === "conflict") {
        // Sem `setState("conflict")` o autosave voltaria a disparar em 1,2 s e insistiria até
        // vencer. Parar é o comportamento: a spec §42 diz que conflito nunca sobrescreve.
        setState("conflict");
        setMessage(outcome.message ?? "Esta questão mudou desde que você abriu.");
        return;
      }

      if (outcome.kind === "failed") {
        setState("error");
        setMessage(outcome.message ?? `Falha ao salvar (status ${outcome.status}).`);
        return;
      }

      if (outcome.version) version.current = outcome.version;
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

  const schedule = useCallback(() => {
    setState((current) => (current === "conflict" ? current : "dirty"));

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), AUTOSAVE_DELAY_MS);
  }, [save]);

  /**
   * O erro de validação dos metadados vem do servidor e cai no mesmo `Banner`: o `MetadataPanel`
   * já recusa localmente o que o domínio recusa, e o que passa por ele é o que a rota aceita.
   */
  const changeMetadata = useCallback(
    (patch: Partial<QuestionMetadata>) => {
      setMetadata((current) => {
        if (current === null) return current;
        const next = { ...current, ...patch };
        metadataRef.current = next;
        return next;
      });
      schedule();
    },
    [schedule],
  );

  const changeField = useCallback(
    (field: QuestionFieldId, value: string) => {
      setDraft((current) => ({ ...current, [field]: value }));
      schedule();
    },
    [schedule],
  );

  // Um debounce pendente na desmontagem gravaria uma questão que não está mais aberta.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return {
    draft,
    state,
    message,
    setMessage,
    blocked: state === "conflict",
    save,
    changeField,
    metadata,
    loadMetadata,
    changeMetadata,
  };
}
