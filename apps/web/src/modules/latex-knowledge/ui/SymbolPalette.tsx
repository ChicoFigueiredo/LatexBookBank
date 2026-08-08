"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";

import { Input, Select, injectCss } from "@/design-system";
import {
  paletteView,
  symbolPreview,
  type SymbolEntry,
  type SymbolPreview,
} from "@modules/latex-knowledge/domain/symbol-palette";
import { maskUrlFor } from "@shared/css-mask";

/**
 * A palette de símbolos: 2.740 comandos em 13 grupos, buscáveis, inseridos no cursor.
 *
 * O índice vem inteiro numa carga só (291 KB); as miniaturas vêm por grupo, sob demanda. É o que
 * mantém a primeira abertura barata mesmo com `fontawesome5` pesando 1,26 MB em miniaturas.
 */

interface SymbolIndex {
  readonly groups: readonly string[];
  readonly symbols: readonly SymbolEntry[];
}

export interface SymbolPaletteProps {
  readonly onInsert: (command: string) => void;
}

let indexPromise: Promise<SymbolIndex> | null = null;

const loadIndex = (): Promise<SymbolIndex> => {
  indexPromise ??= fetch("/api/latex/symbols")
    .then(async (response) => {
      if (!response.ok) throw new Error(`Falha ao carregar símbolos (${response.status}).`);
      return (await response.json()) as SymbolIndex;
    })
    .catch((error: unknown) => {
      // Erro não fica cacheado: senão uma falha de rede na primeira abertura deixaria a palette
      // vazia pelo resto da sessão.
      indexPromise = null;
      throw error;
    });
  return indexPromise;
};

/**
 * As miniaturas por grupo — o cache guarda a **promessa**, não o valor.
 *
 * Duas consequências, ambas desejadas: abrir o mesmo grupo duas vezes em sequência não dispara
 * duas requisições, e o `setState` sempre acontece dentro de um `.then`, nunca no corpo do efeito
 * (que é o que a regra `react-hooks/set-state-in-effect` do React Compiler proíbe — e com razão,
 * porque um `setState` síncrono ali é uma renderização a mais para chegar ao mesmo lugar).
 */
const previewCache = new Map<string, Promise<Readonly<Record<string, string>>>>();

const loadPreviews = (group: string): Promise<Readonly<Record<string, string>>> => {
  const cached = previewCache.get(group);
  if (cached) return cached;

  const pending = fetch(`/api/latex/symbols/previews?group=${encodeURIComponent(group)}`)
    .then(async (response) => {
      if (!response.ok) return {};
      const payload = (await response.json()) as { previews?: Record<string, string> };
      return payload.previews ?? {};
    })
    .catch(() => {
      // Sem miniatura a célula cai no Unicode ou no comando — a palette continua utilizável.
      previewCache.delete(group);
      return {};
    });

  previewCache.set(group, pending);
  return pending;
};

export function SymbolPalette({ onInsert }: SymbolPaletteProps) {
  const [index, setIndex] = useState<SymbolIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [group, setGroup] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [previews, setPreviews] = useState<Readonly<Record<string, string>>>({});

  useEffect(() => {
    let active = true;
    loadIndex()
      .then((loaded) => {
        if (!active) return;
        setIndex(loaded);
        setGroup((current) => current ?? loaded.groups[0] ?? null);
      })
      .catch(() => {
        if (active) {
          setError(
            "O conhecimento LaTeX não foi importado nesta instalação. Rode `bun run db:import-latex`.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (group === null) return;

    let active = true;
    void loadPreviews(group).then((loaded) => {
      if (active) setPreviews(loaded);
    });

    return () => {
      active = false;
    };
  }, [group]);

  const view = useMemo(
    () => paletteView(index?.symbols ?? [], group, query),
    [index, group, query],
  );

  const insert = useCallback((command: string) => onInsert(command), [onInsert]);

  if (error !== null) {
    return <div style={{ padding: "var(--space-4)", color: "var(--text-secondary)" }}>{error}</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-2)",
          padding: "var(--space-3)",
          borderBottom: "1px solid var(--border-default)",
        }}
      >
        <Input
          type="search"
          size="sm"
          aria-label="Buscar símbolo"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="alpha, arrow, amssymb…"
        />
        <Select
          size="sm"
          aria-label="Grupo de símbolos"
          value={group ?? ""}
          onChange={(event) => setGroup(event.target.value)}
          // Buscando, o resultado atravessa os grupos. O seletor volta a valer quando a busca
          // esvazia; deixá-lo ativo faria parecer que ele filtra o que não filtra.
          disabled={query.trim() !== ""}
        >
          {(index?.groups ?? []).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </Select>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "var(--space-2)" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(40px, 1fr))",
            gap: "var(--space-1)",
          }}
        >
          {view.visible.map((entry) => (
            <SymbolCell
              key={`${entry.groupName}/${entry.command}`}
              preview={symbolPreview(entry, previews[entry.command])}
              entry={entry}
              onInsert={insert}
            />
          ))}
        </div>

        <p
          style={{
            padding: "var(--space-3)",
            color: "var(--text-secondary)",
            fontSize: "var(--text-micro)",
          }}
        >
          {view.matched === 0
            ? "Nenhum símbolo encontrado."
            : view.truncated
              ? `Mostrando ${view.visible.length} de ${view.matched} — refine a busca para ver o resto.`
              : `${view.matched} símbolo(s).`}
        </p>
      </div>
    </div>
  );
}

/**
 * Uma célula.
 *
 * A miniatura entra como **máscara CSS**, não como `dangerouslySetInnerHTML` nem como `<img>`.
 * Os três caminhos desenham; só este atende às duas exigências ao mesmo tempo:
 *
 * - `<svg>` embutido no HTML executaria script se algum SVG trouxesse um — é conteúdo de terceiro;
 * - `<img>` não executa script, mas também não herda cor, e `currentColor` ficaria preto no tema
 *   escuro;
 * - máscara não executa nada **e** a cor vem do `background`, que é o texto do tema.
 */
/**
 * A máscara vem de uma **variável CSS**, e não de oito propriedades inline por célula.
 *
 * Além de mais leve com 400 células na tela, é o que torna a técnica **observável em teste**: o
 * React grava propriedade customizada com `setProperty`, que o happy-dom implementa, enquanto
 * `style.maskImage` é atribuição camelCase que ele ignora em silêncio. Funcionava no navegador e
 * sumia no teste — a pior combinação possível, e foi assim que apareceu, no preview da Fase 5.
 */
const SYMBOL_CSS = `
.lbb-symbol{display:block;width:22px;height:22px;background-color:currentColor;
  -webkit-mask-image:var(--lbb-symbol-src);mask-image:var(--lbb-symbol-src);
  -webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;
  -webkit-mask-position:center;mask-position:center;
  -webkit-mask-size:contain;mask-size:contain}
`;

function SymbolCell({
  preview,
  entry,
  onInsert,
}: {
  readonly preview: SymbolPreview;
  readonly entry: SymbolEntry;
  readonly onInsert: (command: string) => void;
}) {
  injectCss("lbb-symbol-css", SYMBOL_CSS);

  const title = [
    entry.command,
    entry.requiredPackage ? `pacote ${entry.requiredPackage}` : null,
    entry.mathMode ? "modo matemático" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      type="button"
      title={title}
      aria-label={entry.command}
      onClick={() => onInsert(entry.command)}
      style={{
        display: "grid",
        placeItems: "center",
        height: 40,
        border: "1px solid transparent",
        borderRadius: "var(--radius-sm)",
        background: "transparent",
        color: "var(--text-primary)",
        cursor: "pointer",
        overflow: "hidden",
      }}
    >
      {preview.kind === "svg" ? (
        <span
          className="lbb-symbol"
          aria-hidden="true"
          style={{ "--lbb-symbol-src": maskUrlFor(preview.svg) } as CSSProperties}
        />
      ) : preview.kind === "unicode" ? (
        <span aria-hidden="true" style={{ fontSize: 18 }}>
          {preview.char}
        </span>
      ) : (
        <span
          aria-hidden="true"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            lineHeight: 1.1,
            wordBreak: "break-all",
            padding: 2,
          }}
        >
          {preview.command}
        </span>
      )}
    </button>
  );
}
