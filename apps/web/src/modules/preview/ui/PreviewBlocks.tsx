"use client";

import { createContext, useContext, useMemo, type CSSProperties, type ReactNode } from "react";

import { injectCss } from "@/design-system";
import { maskUrlFor } from "@shared/css-mask";
import type {
  PreviewBlock,
  PreviewInline,
  SourceRange,
} from "@modules/preview/domain/preview-model";
import { renderMath } from "@modules/preview/infrastructure/mathjax";

/**
 * Os blocos do `PreviewModel`, em React.
 *
 * **Nenhum HTML de terceiro entra no documento.** Não há `dangerouslySetInnerHTML` em lugar
 * nenhum deste arquivo, e não há sanitizer — porque não há o que sanitizar. O texto vira nós de
 * texto do React, que escapa por construção, e a fórmula vira **máscara CSS**: um SVG usado como
 * máscara é imagem, e imagem não executa script.
 *
 * É estritamente mais forte do que gerar HTML e limpá-lo depois. Sanitizer é uma lista do que se
 * conhece hoje; não gerar é uma propriedade.
 */

const CSS = `
.lbb-pv-src{margin-left:-10px;padding-left:7px;border-left:3px solid transparent;border-radius:var(--radius-sm);transition:background var(--motion-fast) var(--ease-standard),border-color var(--motion-fast) var(--ease-standard)}
.lbb-pv-src[data-pick="on"]{cursor:pointer}
.lbb-pv-src[data-pick="on"]:hover{background:var(--surface-sunken)}
.lbb-pv-src[data-active="true"]{border-left-color:var(--accent);background:var(--surface-sunken)}
`;

/**
 * Quem está aceso e o que fazer com o clique (D55).
 *
 * Em contexto, e não em propriedade: os blocos se aninham — lista dentro de caixa dentro de
 * item — e passar as duas coisas de mão em mão por cada nível encheria de cerimônia um
 * componente que só desenha.
 */
interface BlockLink {
  readonly active: SourceRange | null;
  readonly onPick: ((range: SourceRange) => void) | null;
}

const NO_LINK: BlockLink = { active: null, onPick: null };
const LinkContext = createContext<BlockLink>(NO_LINK);

export function PreviewBlocks({
  blocks,
  active,
  onPick,
}: {
  readonly blocks: readonly PreviewBlock[];
  readonly active?: SourceRange | null;
  readonly onPick?: (range: SourceRange) => void;
}) {
  injectCss("lbb-preview-src", CSS);
  const inherited = useContext(LinkContext);
  const link = useMemo<BlockLink>(
    () =>
      active === undefined && onPick === undefined
        ? inherited
        : { active: active ?? null, onPick: onPick ?? null },
    [active, onPick, inherited],
  );

  return (
    <LinkContext.Provider value={link}>
      {blocks.map((block, index) => (
        <Located key={index} block={block}>
          <Block block={block} />
        </Located>
      ))}
    </LinkContext.Provider>
  );
}

/**
 * A moldura que liga o bloco ao LaTeX que o gerou: acende quando o cursor está dentro dele, e
 * leva o cursor até lá quando alguém o clica.
 *
 * Bloco sem origem passa direto, sem moldura nenhuma — não há o que acender nem para onde ir.
 */
function Located({
  block,
  children,
}: {
  readonly block: PreviewBlock;
  readonly children: ReactNode;
}) {
  const { active, onPick } = useContext(LinkContext);
  const range = block.range;
  if (!range) return <>{children}</>;

  const isActive = active !== null && active.from === range.from && active.to === range.to;

  return (
    <div
      className="lbb-pv-src"
      data-active={isActive ? "true" : undefined}
      data-pick={onPick ? "on" : undefined}
      {...(onPick
        ? {
            title: "Ir para este trecho no editor",
            onClick: (event: React.MouseEvent) => {
              // O bloco mais interno ganha: sem isto, clicar num item também avisaria a lista.
              event.stopPropagation();
              // Selecionar texto no preview é leitura, não navegação: só o clique limpo leva o
              // cursor embora.
              if (window.getSelection()?.isCollapsed === false) return;
              onPick(range);
            },
          }
        : {})}
    >
      {children}
    </div>
  );
}

function Block({ block }: { readonly block: PreviewBlock }) {
  switch (block.kind) {
    case "paragraph":
      return (
        <p style={{ margin: "0 0 var(--space-3)", lineHeight: 1.6 }}>
          <Inlines inlines={block.inlines} />
        </p>
      );

    case "displayMath":
      return (
        <div style={{ margin: "var(--space-4) 0", textAlign: "center" }}>
          <MathFormula latex={block.latex} display />
        </div>
      );

    case "list": {
      const List = block.ordered ? "ol" : "ul";
      return (
        <List style={{ margin: "0 0 var(--space-3)", paddingLeft: "var(--space-5)" }}>
          {block.items.map((item, index) => (
            <li key={index} style={{ marginBottom: "var(--space-2)" }}>
              <PreviewBlocks blocks={item.blocks} />
            </li>
          ))}
        </List>
      );
    }

    case "image":
      // O caminho vem do LaTeX e ainda não resolve para lugar nenhum: os arquivos do acervo
      // entram como Asset na Fase 11. Mostrar a moldura com o nome é honesto — some com a
      // figura, mas não finge que ela não estava lá.
      return (
        <figure
          style={{
            margin: "var(--space-4) 0",
            padding: "var(--space-4)",
            border: "1px dashed var(--border-default)",
            borderRadius: "var(--radius-md)",
            textAlign: "center",
            color: "var(--text-secondary)",
            fontSize: "var(--text-body-sm)",
            ...(block.widthFraction !== null
              ? { width: `${Math.round(block.widthFraction * 100)}%`, marginInline: "auto" }
              : {}),
          }}
        >
          figura: {block.path}
        </figure>
      );

    case "box":
      return (
        <div
          style={{
            margin: "0 0 var(--space-3)",
            padding: "var(--space-3) var(--space-4)",
            borderLeft: "3px solid var(--border-strong)",
            background: "var(--surface-sunken)",
            borderRadius: "var(--radius-sm)",
          }}
        >
          <PreviewBlocks blocks={block.blocks} />
        </div>
      );
  }
}

function Inlines({ inlines }: { readonly inlines: readonly PreviewInline[] }) {
  return (
    <>
      {inlines.map((inline, index) => (
        <Inline key={index} inline={inline} />
      ))}
    </>
  );
}

const STYLE_TAGS = {
  bold: "strong",
  italic: "em",
  underline: "u",
  code: "code",
} as const;

function Inline({ inline }: { readonly inline: PreviewInline }) {
  switch (inline.kind) {
    case "text":
      return <>{inline.text}</>;
    case "break":
      return <br />;
    case "math":
      return <MathFormula latex={inline.latex} display={false} />;
    case "styled": {
      const Tag = STYLE_TAGS[inline.style];
      return (
        <Tag>
          <Inlines inlines={inline.inlines} />
        </Tag>
      );
    }
  }
}

/**
 * A máscara vem de uma **variável CSS**, não de oito propriedades inline por fórmula.
 *
 * Dois ganhos concretos. Um enunciado com trinta fórmulas passa a carregar trinta declarações em
 * vez de duzentas e quarenta. E, mais importante, isto **fica testável**: o React grava
 * propriedade customizada com `setProperty`, que o happy-dom implementa, enquanto `style.maskImage`
 * é uma atribuição camelCase que ele ignora em silêncio — a técnica funcionava no navegador e
 * desaparecia no teste, que é a pior combinação possível.
 */
const MATH_CSS = `
.lbb-math{display:inline-block;background-color:currentColor;
  -webkit-mask-image:var(--lbb-math-src);mask-image:var(--lbb-math-src);
  -webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;
  -webkit-mask-size:contain;mask-size:contain}
`;

/**
 * Uma fórmula, desenhada como máscara.
 *
 * As medidas vêm em `ex` — a altura do "x" da fonte corrente —, então a fórmula acompanha o
 * tamanho do texto sem nenhuma conta. O `verticalAlign` negativo é o que faz uma fração sentar
 * **na** linha em vez de flutuar acima dela.
 *
 * `backgroundColor: currentColor` sob a máscara é o que dá cor à fórmula, e é por isso que ela
 * segue o tema — o SVG do MathJax vem com `fill="currentColor"`, que não seria herdado se a
 * imagem entrasse por `<img>`.
 */
// `MathFormula`, e não `Math`: um componente chamado `Math` sombreia o `Math` global do
// JavaScript dentro deste módulo, e `Math.round` no bloco de imagem passa a ser erro de tipo.
// O compilador pegou; num arquivo sem tipos teria virado erro em tempo de execução.
function MathFormula({ latex, display }: { readonly latex: string; readonly display: boolean }) {
  injectCss("lbb-math-css", MATH_CSS);

  const rendered = renderMath(latex, display);

  if (rendered === null) {
    // Fórmula que nem o MathJax conseguiu ler o suficiente para desenhar um erro. O texto cru é
    // informação melhor que um espaço vazio, e é o que deixa quem escreve ver onde errou.
    return (
      <code style={{ color: "var(--danger)", fontFamily: "var(--font-mono)" }}>
        {display ? `$$${latex}$$` : `$${latex}$`}
      </code>
    );
  }

  return (
    <span
      className="lbb-math"
      role="math"
      aria-label={latex}
      style={
        {
          width: `${rendered.widthEx}ex`,
          height: `${rendered.heightEx}ex`,
          verticalAlign: `${-rendered.verticalAlignEx}ex`,
          "--lbb-math-src": maskUrlFor(rendered.svg),
        } as CSSProperties
      }
    />
  );
}
