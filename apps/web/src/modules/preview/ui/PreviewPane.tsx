"use client";

import { useDeferredValue, useEffect, useMemo, useRef } from "react";

import { Badge } from "@/design-system";
import { buildPreviewModel, type PreviewSource } from "@modules/preview/domain/build-preview-model";
import {
  PREVIEW_DISCLAIMER,
  type PreviewBlock,
  type SourceRange,
} from "@modules/preview/domain/preview-model";

import { PreviewBlocks } from "./PreviewBlocks";

/**
 * O preview rápido (spec §11).
 *
 * **Por que `useDeferredValue` e não um `setTimeout` de debounce.** Debounce escolhe uma latência
 * fixa e torce para ela servir: curta demais engasga em máquina lenta, longa demais atrasa quem
 * digita devagar. O `useDeferredValue` deixa o React medir — ele mantém o preview anterior na
 * tela enquanto a digitação continua e recalcula quando sobra tempo. A latência passa a se
 * adaptar à máquina, que é justamente o critério de aceite ("parece imediata", "nunca congela").
 *
 * O debounce ainda existe, e continua configurável: é o do **autosave**, que fala com o servidor.
 * Este preview não fala com ninguém — é conta local sobre texto que já está na memória.
 */

/** Os campos que o editor edita — e que, por isso, o cursor pode estar visitando. */
export type PreviewField = "statement" | "solution" | "complement";

export interface PreviewPaneProps {
  readonly source: PreviewSource;
  /** Onde o cursor está, em caracteres, e em qual campo (D55). */
  readonly cursor?: { readonly field: PreviewField; readonly offset: number } | null;
  /** Clicar num bloco leva o cursor até o trecho que o gerou. */
  readonly onPick?: (field: PreviewField, offset: number) => void;
}

/**
 * O bloco mais **estreito** que contém o cursor.
 *
 * Mais estreito, e não o primeiro: o item de uma lista está dentro da lista, e acender os dois
 * transformaria o destaque em mancha. Quem está por dentro ganha.
 */
function blockAt(blocks: readonly PreviewBlock[], offset: number): SourceRange | null {
  let best: SourceRange | null = null;
  // O cursor cai fora de todo bloco o tempo todo: a linha em branco entre dois parágrafos não
  // pertence a nenhum dos dois. Apagar o destaque a cada `Enter` faria o preview piscar, então
  // nesses vãos vale o último bloco que ficou para trás.
  let before: SourceRange | null = null;

  const visit = (list: readonly PreviewBlock[]): void => {
    for (const block of list) {
      const range = block.range;
      if (range) {
        if (offset >= range.from && offset <= range.to) {
          if (best === null || range.to - range.from < best.to - best.from) best = range;
        } else if (range.to <= offset && (before === null || range.to > before.to)) {
          before = range;
        }
      }
      if (block.kind === "box") visit(block.blocks);
      if (block.kind === "list") for (const item of block.items) visit(item.blocks);
    }
  };

  visit(blocks);
  return best ?? before;
}

export function PreviewPane({ source, cursor = null, onPick }: PreviewPaneProps) {
  // O valor adiado é a fonte inteira: adiar campo a campo faria o preview mostrar um enunciado
  // novo com alternativas velhas por um instante, que é pior do que mostrar tudo velho.
  const deferred = useDeferredValue(source);
  const model = useMemo(() => buildPreviewModel(deferred), [deferred]);

  const stale = deferred !== source;

  const active = useMemo(() => {
    if (!cursor) return null;
    const blocks =
      cursor.field === "statement"
        ? model.statement
        : cursor.field === "solution"
          ? model.solution
          : model.complement;
    return blockAt(blocks, cursor.offset);
  }, [cursor, model]);

  /*
    Rolar até o bloco aceso — e só quando ele **muda**.

    Rolar a cada tecla brigaria com quem está lendo o preview: a pessoa rola para conferir o fim
    da resolução, digita uma vírgula no enunciado, e a tela pula de volta. `nearest` pelo mesmo
    motivo: se o bloco já está à vista, não se mexe nada.
  */
  const body = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!active) return;
    // A classe entra no seletor de propósito: `data-active` é atributo comum na casa (a barra
    // lateral também o usa), e um seletor solto aqui rolaria até o painel errado.
    body.current
      ?.querySelector('.lbb-pv-src[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);
  const empty =
    model.statement.length === 0 &&
    model.options.length === 0 &&
    model.solution.length === 0 &&
    model.complement.length === 0;

  return (
    <section
      aria-label="Preview rápido"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        background: "var(--surface)",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          padding: "var(--space-2) var(--space-4)",
          borderBottom: "1px solid var(--border-default)",
          color: "var(--text-secondary)",
          fontSize: "var(--text-micro)",
        }}
      >
        {/* O aviso da §11 é permanente, e é permanente de propósito: o HTML não é fonte de
            verdade para compatibilidade de LaTeX, e quem confiar nele vai se surpreender no PDF. */}
        <span>{PREVIEW_DISCLAIMER}</span>
        {/* `aria-live` para quem não vê o selo: a informação é que o que está na tela ainda não
            reflete a última tecla. Sem isso, o preview parece simplesmente errado. */}
        <span aria-live="polite" style={{ marginLeft: "auto" }}>
          {stale ? <Badge tone="info">atualizando…</Badge> : null}
        </span>
      </header>

      <div
        ref={body}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "var(--space-5)",
          fontFamily: "var(--font-ui)",
          fontSize: "var(--text-body)",
          color: "var(--text-primary)",
          // Enquanto o valor está desatualizado, o conteúdo esmaece em vez de sumir: uma tela em
          // branco a cada tecla seria pior do que uma tela um instante atrasada.
          opacity: stale ? 0.6 : 1,
          transition: "opacity var(--motion-fast) var(--ease-standard)",
        }}
      >
        {empty ? (
          <p style={{ color: "var(--text-secondary)" }}>
            O preview aparece aqui conforme você escreve o enunciado.
          </p>
        ) : (
          <>
            <PreviewBlocks
              blocks={model.statement}
              active={cursor?.field === "statement" ? active : null}
              {...(onPick
                ? { onPick: (range: SourceRange) => onPick("statement", range.from) }
                : {})}
            />

            {model.options.length > 0 && (
              <ol
                style={{
                  listStyle: "none",
                  margin: "var(--space-4) 0 0",
                  padding: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-2)",
                }}
              >
                {model.options.map((option) => (
                  <li key={option.letter} style={{ display: "flex", gap: "var(--space-2)" }}>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        color: option.isCorrect ? "var(--ok)" : "var(--text-secondary)",
                        fontWeight: option.isCorrect
                          ? "var(--weight-medium)"
                          : "var(--weight-regular)",
                      }}
                    >
                      {option.letter})
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <PreviewBlocks blocks={option.blocks} />
                    </div>
                  </li>
                ))}
              </ol>
            )}

            <Section
              title="Resposta"
              blocks={model.solution}
              active={cursor?.field === "solution" ? active : null}
              {...(onPick
                ? { onPick: (range: SourceRange) => onPick("solution", range.from) }
                : {})}
            />
            <Section
              title="Complemento"
              blocks={model.complement}
              active={cursor?.field === "complement" ? active : null}
              {...(onPick
                ? { onPick: (range: SourceRange) => onPick("complement", range.from) }
                : {})}
            />
          </>
        )}
      </div>
    </section>
  );
}

function Section({
  title,
  blocks,
  active = null,
  onPick,
}: {
  readonly title: string;
  readonly blocks: readonly PreviewBlock[];
  readonly active?: SourceRange | null;
  readonly onPick?: (range: SourceRange) => void;
}) {
  if (blocks.length === 0) return null;

  return (
    <div style={{ marginTop: "var(--space-5)" }}>
      <h3
        style={{
          margin: "0 0 var(--space-2)",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-micro)",
          fontWeight: "var(--weight-medium)",
          letterSpacing: "var(--tracking-wide)",
          textTransform: "uppercase",
          color: "var(--text-secondary)",
        }}
      >
        {title}
      </h3>
      <PreviewBlocks blocks={blocks} active={active} {...(onPick ? { onPick } : {})} />
    </div>
  );
}
