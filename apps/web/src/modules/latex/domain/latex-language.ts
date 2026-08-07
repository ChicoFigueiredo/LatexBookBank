/**
 * A linguagem LaTeX como **dado**, não como configuração espalhada pelo editor.
 *
 * Fica no domínio, com tipos próprios, e não importa `monaco-editor`. Dois motivos: assim isto é
 * testável sem subir um editor num jsdom, e a Fase 4 vai alimentar as mesmas estruturas com o
 * conhecimento vindo do `LatexMetadata.db` legado — 653 autocompletes e 2.741 símbolos. Se o
 * formato fosse o do Monaco, aquele importador dependeria do editor.
 *
 * A adaptação para os tipos do Monaco acontece na camada de UI, em um arquivo só.
 */

export const LATEX_LANGUAGE_ID = "latex";

export interface BracketPair {
  readonly open: string;
  readonly close: string;
}

export interface LatexLanguageConfiguration {
  readonly comments: { readonly lineComment: string };
  readonly brackets: readonly (readonly [string, string])[];
  readonly autoClosingPairs: readonly BracketPair[];
  readonly surroundingPairs: readonly BracketPair[];
}

/**
 * Configuração estrutural.
 *
 * `$` fecha sozinho porque matemática inline é o gesto mais repetido do acervo. `\[` e `\(` não
 * entram como par de fechamento automático: o Monaco casaria o `\` sozinho em qualquer comando, e
 * digitar `\alpha` passaria a inserir um fecha-colchete no meio da palavra.
 */
export const LATEX_LANGUAGE_CONFIGURATION: LatexLanguageConfiguration = {
  comments: { lineComment: "%" },
  brackets: [
    ["{", "}"],
    ["[", "]"],
    ["(", ")"],
  ],
  autoClosingPairs: [
    { open: "{", close: "}" },
    { open: "[", close: "]" },
    { open: "(", close: ")" },
    { open: "$", close: "$" },
  ],
  surroundingPairs: [
    { open: "{", close: "}" },
    { open: "[", close: "]" },
    { open: "(", close: ")" },
    { open: "$", close: "$" },
  ],
};

/**
 * Tokenizador no formato Monarch, declarado como dado puro.
 *
 * A ordem das regras é significativa — a primeira que casa vence. `%` vem antes de tudo porque
 * comentário engole o resto da linha, inclusive `$` e `\`: sem isso, um `% custa $10` abriria
 * modo matemático e pintaria o arquivo inteiro de verde a partir dali.
 */
export const LATEX_MONARCH_TOKENS = {
  defaultToken: "",
  tokenPostfix: ".tex",

  tokenizer: {
    root: [
      // Comentário primeiro: engole a linha e evita que `$` ou `\` dentro dele mudem o estado.
      [/%.*$/, "comment"],

      // `\begin{...}` e `\end{...}` recebem token próprio: são o esqueleto do documento, e
      // distingui-los de um comando qualquer é o que faz o dobramento e a leitura funcionarem.
      [
        /(\\(?:begin|end))(\s*)(\{)([^}]*)(\})/,
        ["keyword", "", "delimiter.curly", "type", "delimiter.curly"],
      ],

      // Matemática display antes da inline — `$$` casaria como dois `$` vazios.
      [/\$\$/, { token: "string", next: "@displayMath" }],
      [/\$/, { token: "string", next: "@inlineMath" }],
      [/\\\[/, { token: "string", next: "@displayMathBracket" }],

      [/\\[a-zA-Z@]+/, "keyword"],
      // Comando de um caractere só: `\\`, `\{`, `\%`, `\$`. Sem esta regra, o `\%` viraria
      // comentário e comeria o resto da linha.
      [/\\./, "keyword"],

      [/[{}]/, "delimiter.curly"],
      [/[[\]]/, "delimiter.square"],
      [/&/, "delimiter"],
      [/[~^_]/, "operator"],
    ],

    inlineMath: [
      [/%.*$/, "comment"],
      [/\\./, "keyword"],
      [/\$/, { token: "string", next: "@pop" }],
      [/[^\\$%]+/, "string"],
    ],

    displayMath: [
      [/%.*$/, "comment"],
      [/\\./, "keyword"],
      [/\$\$/, { token: "string", next: "@pop" }],
      [/[^\\$%]+/, "string"],
    ],

    displayMathBracket: [
      [/%.*$/, "comment"],
      [/\\\]/, { token: "string", next: "@pop" }],
      [/\\./, "keyword"],
      [/[^\\%]+/, "string"],
    ],
  },
} as const;

/** Campos editáveis de uma questão, na ordem das abas (spec §10). */
export const QUESTION_FIELDS = [
  { id: "statementLatex", label: "Conteúdo" },
  { id: "solutionLatex", label: "Resposta" },
  { id: "complementLatex", label: "Complemento" },
] as const;

export type QuestionFieldId = (typeof QUESTION_FIELDS)[number]["id"];

export const isQuestionField = (value: string): value is QuestionFieldId =>
  QUESTION_FIELDS.some((field) => field.id === value);
