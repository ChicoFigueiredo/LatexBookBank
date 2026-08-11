"use client";

import { useCallback, useMemo, useState } from "react";

import { Badge, Button, Input } from "@/design-system";
import {
  shuffledForDisplay,
  sortOptions,
  type OptionRecord,
} from "@modules/questions/domain/option-mutations";
import { optionLabelAt } from "@modules/questions/domain/question-type";

/**
 * A lista de alternativas.
 *
 * A letra é **posição na lista**, calculada no render. Nunca vem do servidor e nunca é gravada —
 * é a mesma regra que faz o gabarito sobreviver à reordenação (D9, spec §8.5).
 *
 * Arrastar usa os handlers nativos de HTML e não uma biblioteca. A árvore usa `@dnd-kit` porque
 * tem aninhamento, zonas de queda e teclado; aqui são cinco linhas numa coluna, e trazer a
 * biblioteca para isso seria pagar peso por um caso que `draggable` resolve. O teclado tem os
 * botões de subir e descer, que também é o que quem não usa mouse prefere.
 */

export interface OptionsEditorProps {
  readonly options: readonly OptionRecord[];
  readonly onAdd: () => void;
  readonly onRemove: (optionId: string) => void;
  readonly onMove: (optionId: string, targetIndex: number) => void;
  readonly onSetCorrect: (optionId: string) => void;
  readonly onEdit: (optionId: string, statementLatex: string) => void;
  readonly disabled?: boolean;
}

export function OptionsEditor({
  options,
  onAdd,
  onRemove,
  onMove,
  onSetCorrect,
  onEdit,
  disabled = false,
}: OptionsEditorProps) {
  const ordered = useMemo(() => sortOptions(options), [options]);

  /**
   * Ordem embaralhada, quando pedida.
   *
   * Fica em estado local e **não** volta para o servidor: embaralhar é conferência visual — "o
   * gabarito continua certo se as alternativas trocarem de lugar?" —, não uma edição.
   */
  const [shuffled, setShuffled] = useState<readonly OptionRecord[] | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const visible = shuffled ?? ordered;

  const shuffle = useCallback(() => {
    setShuffled(shuffledForDisplay(ordered, Math.random));
  }, [ordered]);

  const move = useCallback(
    (optionId: string, targetIndex: number) => {
      // Sair do modo embaralhado antes de mover: mover "para a terceira posição" da lista
      // embaralhada gravaria uma ordem que a pessoa nunca viu como definitiva.
      setShuffled(null);
      onMove(optionId, targetIndex);
    },
    [onMove],
  );

  return (
    <section aria-label="Alternativas" style={{ display: "grid", gap: "var(--space-2)" }}>
      <header style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <h3
          style={{
            margin: 0,
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-micro)",
            letterSpacing: "var(--tracking-wide)",
            textTransform: "uppercase",
            color: "var(--text-secondary)",
          }}
        >
          Alternativas
        </h3>

        {shuffled !== null && (
          // O selo é a diferença entre "conferindo" e "mudei a ordem": sem ele, a pessoa sai da
          // tela achando que gravou o embaralhamento.
          <Badge tone="info">visualização embaralhada — nada foi gravado</Badge>
        )}

        <div style={{ marginLeft: "auto", display: "flex", gap: "var(--space-1)" }}>
          <Button
            size="sm"
            variant="ghost"
            onClick={shuffled === null ? shuffle : () => setShuffled(null)}
            disabled={disabled || ordered.length < 2}
          >
            {shuffled === null ? "Embaralhar" : "Ordem original"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onAdd} disabled={disabled}>
            Adicionar
          </Button>
        </div>
      </header>

      {visible.length === 0 ? (
        <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-body-sm)" }}>
          Sem alternativas. Questões discursivas não precisam de nenhuma.
        </p>
      ) : (
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 4 }}>
          {visible.map((option, index) => (
            <li
              key={option.id}
              draggable={!disabled && shuffled === null}
              onDragStart={() => setDragging(option.id)}
              onDragEnd={() => setDragging(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (dragging !== null && dragging !== option.id) move(dragging, index);
                setDragging(null);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-2)",
                padding: "var(--space-1) var(--space-2)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid",
                borderColor: option.isCorrect ? "var(--ok)" : "var(--border-default)",
                background: option.isCorrect ? "var(--ok-surface)" : "transparent",
                opacity: dragging === option.id ? 0.5 : 1,
              }}
            >
              <button
                type="button"
                onClick={() => onSetCorrect(option.id)}
                disabled={disabled}
                // `radio` e não `checkbox`: em múltipla escolha marcar uma desmarca a outra, e é
                // o leitor de tela que precisa saber disso — não só a cor da borda.
                role="radio"
                aria-checked={option.isCorrect}
                aria-label={`Marcar ${optionLabelAt(index)} como correta`}
                style={{
                  fontFamily: "var(--font-mono)",
                  minWidth: "2.5rem",
                  border: 0,
                  background: "transparent",
                  color: option.isCorrect ? "var(--ok)" : "var(--text-secondary)",
                  cursor: disabled ? "not-allowed" : "pointer",
                }}
              >
                {/* A letra vem do índice, sempre. */}
                {optionLabelAt(index)})
              </button>

              <Input
                size="sm"
                mono
                value={option.statementLatex}
                onChange={(event) => onEdit(option.id, event.target.value)}
                disabled={disabled || shuffled !== null}
                aria-label={`Texto da alternativa ${optionLabelAt(index)}`}
                style={{ flex: 1 }}
              />

              {/* Subir e descer existem para quem não usa mouse — e são mais precisos que o
                  arrasto para mover uma casa, que é o movimento mais comum. */}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => move(option.id, index - 1)}
                disabled={disabled || shuffled !== null || index === 0}
                aria-label={`Subir alternativa ${optionLabelAt(index)}`}
              >
                ↑
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => move(option.id, index + 1)}
                disabled={disabled || shuffled !== null || index === visible.length - 1}
                aria-label={`Descer alternativa ${optionLabelAt(index)}`}
              >
                ↓
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onRemove(option.id)}
                disabled={disabled || shuffled !== null}
                aria-label={`Remover alternativa ${optionLabelAt(index)}`}
              >
                ×
              </Button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
