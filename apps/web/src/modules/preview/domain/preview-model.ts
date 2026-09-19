/**
 * O `PreviewModel`: o que o preview rápido desenha, descrito sem HTML e sem React.
 *
 * A spec §11 é explícita sobre o pipeline — `QuestionAggregate → PreviewModel → React → MathJax` —
 * e sobre a natureza da coisa: **o HTML não é fonte de verdade para compatibilidade de LaTeX**. O
 * modelo aqui é, portanto, deliberadamente pequeno. Ele cobre parágrafos, marcadores, matemática,
 * imagens e caixas, e nada mais.
 *
 * A consequência de projeto é a regra de degradação: **comando desconhecido some, argumento fica**.
 * Um preview que trava ao encontrar `\xlop` — que o TeX entende e este modelo não — seria pior que
 * um preview aproximado, porque o objetivo declarado é feedback em dezenas de milissegundos, não
 * fidelidade. A fidelidade é da Fase 6, e é por isso que o aviso de divergência fica permanente.
 */

export type PreviewInline =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "math"; readonly latex: string }
  | { readonly kind: "break" }
  | {
      readonly kind: "styled";
      readonly style: PreviewStyle;
      readonly inlines: readonly PreviewInline[];
    };

export type PreviewStyle = "bold" | "italic" | "underline" | "code";

/**
 * De onde o bloco veio, no LaTeX que o gerou — em índices do texto **original**, com comentários
 * e tudo.
 *
 * É o que liga as duas metades da tela: o cursor no editor acende o bloco no preview, e clicar no
 * bloco leva o cursor de volta. Opcional porque nem todo bloco sabe dizer: um item de lista com
 * rótulo (`\item[a)]`) tem o rótulo costurado ao texto, e aí a conta de posição deixaria de
 * valer — melhor não afirmar do que apontar para o lugar errado.
 */
export interface SourceRange {
  readonly from: number;
  readonly to: number;
}

export type PreviewBlock = (
  | { readonly kind: "paragraph"; readonly inlines: readonly PreviewInline[] }
  | { readonly kind: "displayMath"; readonly latex: string }
  | { readonly kind: "list"; readonly ordered: boolean; readonly items: readonly PreviewItem[] }
  | { readonly kind: "image"; readonly path: string; readonly widthFraction: number | null }
  | { readonly kind: "box"; readonly blocks: readonly PreviewBlock[] }
) & { readonly range?: SourceRange };

export interface PreviewItem {
  readonly blocks: readonly PreviewBlock[];
}

/** Uma alternativa, já com a letra que o preview mostra. */
export interface PreviewOption {
  /** `a`, `b`, `c`… A letra é **derivada da ordem**, nunca identidade (D9). */
  readonly letter: string;
  readonly blocks: readonly PreviewBlock[];
  readonly isCorrect: boolean;
}

export interface PreviewModel {
  readonly statement: readonly PreviewBlock[];
  readonly options: readonly PreviewOption[];
  readonly solution: readonly PreviewBlock[];
  readonly complement: readonly PreviewBlock[];
}

/** O aviso da spec §11, permanente na tela. */
export const PREVIEW_DISCLAIMER = "Preview rápido — pode diferir do PDF final.";
