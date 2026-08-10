"use client";

import { useState } from "react";

import { Badge, Button, Field, Input, injectCss } from "@/design-system";
import { parseTagInput, type TagSuggestion } from "@modules/questions/domain/tag";

/**
 * As tags de uma questão: marcar, desmarcar, sugerir.
 *
 * Puro de propósito — recebe a lista e três callbacks, e não sabe que existe servidor. É o que
 * permite testar aqui as decisões que importam (colar uma lista, a sugestão vencer a digitação)
 * sem subir rota nenhuma.
 *
 * O campo aceita **vírgula**: colar "álgebra, funções, 2º grau" é o gesto real de quem organiza o
 * acervo, e obrigar a marcar uma por vez transformaria um gesto em três.
 *
 * Ver spec §33 · issue #141.
 */

const CSS = `
.lbb-tags{display:grid;gap:var(--space-3)}
.lbb-tags-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.lbb-tags-chip{display:inline-flex;align-items:center;gap:4px}
.lbb-tags-x{border:0;background:transparent;color:var(--text-secondary);cursor:pointer;padding:0 2px;line-height:1;font-size:var(--text-body)}
.lbb-tags-x:hover{color:var(--danger-text)}
.lbb-tags-x:focus-visible{outline:2px solid var(--focus-ring);outline-offset:1px;border-radius:2px}
.lbb-tags-sug{display:flex;flex-wrap:wrap;gap:6px}
.lbb-tags-count{font-family:var(--font-mono);font-size:var(--text-micro);color:var(--text-secondary)}
.lbb-tags-empty{font-size:var(--text-body-sm);color:var(--text-secondary)}
`;

export interface TagsPanelProps {
  readonly applied: readonly { readonly id: string; readonly name: string }[];
  readonly suggestions: readonly TagSuggestion[];
  readonly onApply: (names: readonly string[]) => void;
  readonly onRemove: (tagId: string) => void;
  /** Digitação, para o pai buscar as sugestões onde elas moram. */
  readonly onQueryChange?: (query: string) => void;
  readonly disabled?: boolean;
}

export function TagsPanel({
  applied,
  suggestions,
  onApply,
  onRemove,
  onQueryChange,
  disabled = false,
}: TagsPanelProps) {
  injectCss("lbb-tags-css", CSS);

  const [draft, setDraft] = useState("");

  const apply = (text: string) => {
    const names = parseTagInput(text);
    if (names.length === 0) return;

    onApply(names);
    setDraft("");
    onQueryChange?.("");
  };

  // A sugestão já aplicada sai da lista: oferecê-la de novo seria oferecer um clique que não faz
  // nada, e quem clica conclui que a tela travou.
  const appliedKeys = new Set(applied.map((tag) => tag.name.toLowerCase()));
  const offered = suggestions.filter((tag) => !appliedKeys.has(tag.name.toLowerCase()));

  return (
    <div className="lbb-tags">
      <div className="lbb-tags-row">
        {applied.length === 0 ? (
          <span className="lbb-tags-empty">Nenhuma tag ainda.</span>
        ) : (
          applied.map((tag) => (
            <span key={tag.id} className="lbb-tags-chip">
              <Badge tone="neutral">
                {tag.name}
                <button
                  type="button"
                  className="lbb-tags-x"
                  aria-label={`Remover ${tag.name}`}
                  disabled={disabled}
                  onClick={() => onRemove(tag.id)}
                >
                  ×
                </button>
              </Badge>
            </span>
          ))
        )}
      </div>

      <Field label="Marcar tags" hint="Separe por vírgula. Enter aplica.">
        <Input
          placeholder="álgebra, funções, 2º grau"
          value={draft}
          disabled={disabled}
          onChange={(event) => {
            setDraft(event.target.value);
            onQueryChange?.(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            // Sem isto, `Enter` num campo dentro de formulário submeteria a página — e o gesto
            // mais natural de aplicar uma tag recarregaria o editor.
            event.preventDefault();
            apply(draft);
          }}
        />
      </Field>

      {offered.length > 0 && (
        <div className="lbb-tags-sug">
          {offered.map((tag) => (
            <Button
              key={tag.id}
              size="sm"
              variant="ghost"
              disabled={disabled}
              // Clicar na sugestão aplica **o nome dela**, não o que está digitado: é o gesto de
              // reaproveitar a grafia que já existe, que é a razão de o autocomplete existir.
              onClick={() => apply(tag.name)}
            >
              {tag.name} <span className="lbb-tags-count">{tag.usageCount}</span>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
