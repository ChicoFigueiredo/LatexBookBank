import type {
  HeadingClassification,
  HeadingEvidence,
  ScanSemanticKind,
  SemanticPromptInput,
  SourceScanProfilePlugin,
} from "../source-scan-profile";

const allowedChildren: Readonly<Record<string, readonly ScanSemanticKind[]>> = {
  ROOT: ["BOOK", "PART", "CHAPTER", "SECTION", "CONTENT", "EXERCISE_GROUP", "EXERCISE"],
  BOOK: ["PART", "CHAPTER", "SECTION", "CONTENT", "EXERCISE_GROUP", "EXERCISE", "NOTE"],
  PART: ["CHAPTER", "SECTION", "CONTENT", "EXERCISE_GROUP", "EXERCISE", "NOTE"],
  CHAPTER: ["SECTION", "SUBSECTION", "CONTENT", "EXAMPLE", "EXERCISE_GROUP", "EXERCISE", "FIGURE", "NOTE"],
  SECTION: ["SUBSECTION", "CONTENT", "EXAMPLE", "EXERCISE_GROUP", "EXERCISE", "FIGURE", "NOTE"],
  SUBSECTION: ["CONTENT", "EXAMPLE", "EXERCISE_GROUP", "EXERCISE", "FIGURE", "NOTE"],
  CONTENT: ["EXAMPLE", "EXERCISE_GROUP", "EXERCISE", "FIGURE", "NOTE"],
  EXAMPLE: ["ITEM", "SUBITEM", "FIGURE", "NOTE"],
  EXERCISE_GROUP: ["EXERCISE", "QUESTION", "ITEM", "SUBITEM", "NOTE"],
  EXERCISE: ["ITEM", "SUBITEM", "FIGURE", "NOTE"],
  QUESTION: ["ITEM", "SUBITEM", "FIGURE", "NOTE"],
  ITEM: ["SUBITEM", "FIGURE", "NOTE"],
  SUBITEM: ["FIGURE", "NOTE"],
  FIGURE: [],
  NOTE: [],
};

const patterns: readonly [RegExp, ScanSemanticKind, string][] = [
  [/^parte\s+([ivxlcdm]+|\d+)\b/i, "PART", "part marker"],
  [/^cap[ií]tulo\s+([ivxlcdm]+|\d+)\b/i, "CHAPTER", "chapter marker"],
  [/^\d+(?:\.\d+){0}\s+\S+/, "CHAPTER", "numeric top-level heading"],
  [/^\d+\.\d+\s+\S+/, "SECTION", "numeric section heading"],
  [/^\d+\.\d+\.\d+\s+\S+/, "SUBSECTION", "numeric subsection heading"],
  [/^exemplo\s+([\divxlcdm]+)/i, "EXAMPLE", "example marker"],
  [/^exerc[ií]cios?\b/i, "EXERCISE_GROUP", "exercise group marker"],
  [/^(exerc[ií]cio|problema)\s+([\divxlcdm]+)/i, "EXERCISE", "exercise marker"],
];

function labelFrom(text: string): string | null {
  const match = text.match(/\b(\d+(?:\.\d+)*|[IVXLCDM]+)\b/i);
  return match?.[1] ?? null;
}

export const bookSourceScanProfile: SourceScanProfilePlugin = {
  id: "book-v1",
  label: "Livro didático / técnico",
  documentKind: "BOOK",
  semanticKinds: [
    "BOOK",
    "PART",
    "CHAPTER",
    "SECTION",
    "SUBSECTION",
    "CONTENT",
    "EXAMPLE",
    "EXERCISE_GROUP",
    "EXERCISE",
    "ITEM",
    "SUBITEM",
    "FIGURE",
    "NOTE",
  ],

  classifyHeading(evidence: HeadingEvidence): HeadingClassification | null {
    const text = evidence.text.trim();
    for (const [pattern, kind, reason] of patterns) {
      if (pattern.test(text)) {
        return {
          kind,
          originalLabel: labelFrom(text),
          confidence: 0.96,
          reason,
        };
      }
    }

    if ((evidence.fontSizeRatio ?? 1) >= 1.65 && evidence.bold) {
      return {
        kind: evidence.centered ? "CHAPTER" : "SECTION",
        originalLabel: labelFrom(text),
        confidence: 0.68,
        reason: "typographic heading evidence",
      };
    }

    return null;
  },

  canContain(parent: ScanSemanticKind | null, child: ScanSemanticKind): boolean {
    return (allowedChildren[parent ?? "ROOT"] ?? []).includes(child);
  },

  buildSemanticPrompt(input: SemanticPromptInput): string {
    return [
      "Você é um editor técnico especializado em reconstruir a estrutura de livros didáticos e técnicos.",
      "Analise apenas a evidência fornecida. Não invente títulos, números, fórmulas ou conteúdo ausente.",
      "A saída deve ser JSON válido e representar uma árvore editorial.",
      "Tipos permitidos: PART, CHAPTER, SECTION, SUBSECTION, CONTENT, EXAMPLE, EXERCISE_GROUP, EXERCISE, ITEM, SUBITEM, FIGURE, NOTE.",
      "Um elemento pode ocupar múltiplos trechos e múltiplas páginas. Preserve isso como regions[] do MESMO nó; nunca crie dois exercícios só porque houve quebra de página.",
      "Use títulos, numeração, tipografia, recuos, sequência textual e marcadores como evidência de hierarquia.",
      "Em matemática, preserve fórmulas como LaTeX quando a evidência for suficiente; marque baixa confiança quando não for.",
      "Se houver ambiguidade entre SECTION e CONTENT, ou entre EXAMPLE e EXERCISE, escolha a hipótese mais conservadora e explique em evidence[].",
      `Publicação: ${input.publicationTitle}`,
      `Idioma: ${input.language ?? "desconhecido"}`,
      "Páginas analisadas:",
      ...input.pages.map((page, index) => `--- página ${index + 1} ---\n${page}`),
    ].join("\n");
  },
};
