import { describe, expect, it } from "vitest";

import { KIND_LABELS } from "@modules/scan/domain/review-view";
import {
  HEADING_KINDS,
  kindsWhere,
  SCAN_KIND_TRAITS,
  SCAN_KINDS,
  type ScanKind,
} from "@modules/scan/domain/proposal";

/**
 * Os traços de cada tipo do scan, num lugar só (STM-13 da revisão de 2026-09-23).
 *
 * Os conjuntos de cada passada eram nove literais em seis arquivos. Este teste prende a tabela ao
 * que eles diziam quando viraram derivados — a lista ao lado de cada traço é a do literal antigo,
 * copiada do arquivo de onde saiu —, e prende as regras que a tabela tem de cumprir entre si. Um
 * tipo novo entra pela tabela, e o compilador cobra o traço que faltar.
 */

const sorted = (kinds: Iterable<ScanKind>) => [...kinds].sort();

describe("SCAN_KIND_TRAITS", () => {
  it("deriva exatamente os conjuntos que cada passada tinha escritos à mão", () => {
    // proposal.ts e review-view.ts (STRUCTURE): os títulos.
    expect(sorted(HEADING_KINDS)).toEqual(
      sorted(["PART", "CHAPTER", "SECTION", "SUBSECTION", "EXERCISE_GROUP"]),
    );
    // structure.ts: o que o sumário cita.
    expect(sorted(kindsWhere((t) => t.inToc))).toEqual(
      sorted(["PART", "CHAPTER", "SECTION", "SUBSECTION"]),
    );
    // approval-plan.ts: corpo, questão e dobrado.
    expect(sorted(kindsWhere((t) => t.approvesAs === "body"))).toEqual(
      sorted(["CONTENT", "NOTE", "FIGURE"]),
    );
    expect(sorted(kindsWhere((t) => t.approvesAs === "question"))).toEqual(
      sorted(["EXERCISE", "QUESTION"]),
    );
    expect(sorted(kindsWhere((t) => t.approvesAs === "folded"))).toEqual(
      sorted(["ITEM", "SUBITEM"]),
    );
    // approval-plan.ts: o nó de cada tipo que vira nó.
    expect(
      Object.fromEntries(
        SCAN_KINDS.flatMap((kind) => {
          const nodeKind = SCAN_KIND_TRAITS[kind].nodeKind;
          return nodeKind === null ? [] : [[kind, nodeKind]];
        }),
      ),
    ).toEqual({
      PART: "PART",
      CHAPTER: "CHAPTER",
      SECTION: "SECTION",
      SUBSECTION: "SUBSECTION",
      EXERCISE_GROUP: "QUESTION_GROUP",
      EXAMPLE: "EXAMPLE",
    });
    // math-recognition.ts e semantic-review.ts.
    expect(sorted(kindsWhere((t) => t.recognizesMath))).toEqual(
      sorted(["EXERCISE", "QUESTION", "EXAMPLE", "CONTENT", "NOTE"]),
    );
    expect(sorted(kindsWhere((t) => t.reclassifiable))).toEqual(
      sorted(["CONTENT", "EXAMPLE", "EXERCISE", "NOTE", "SECTION", "SUBSECTION"]),
    );
    // review-view.ts: o rótulo com o começo do texto.
    expect(sorted(kindsWhere((t) => t.withSnippet))).toEqual(
      sorted(["EXERCISE", "QUESTION", "ITEM", "SUBITEM", "EXAMPLE"]),
    );
  });

  it("os rótulos da tela vêm da tabela", () => {
    expect(KIND_LABELS).toEqual(
      Object.fromEntries(SCAN_KINDS.map((kind) => [kind, SCAN_KIND_TRAITS[kind].label])),
    );
    expect(KIND_LABELS.EXERCISE_GROUP).toBe("Exercícios");
  });

  it("a aprovação de cada tipo é coerente: só o que vira nó tem tipo de nó", () => {
    for (const kind of SCAN_KINDS) {
      const traits = SCAN_KIND_TRAITS[kind];
      expect(traits.nodeKind !== null, kind).toBe(traits.approvesAs === "node");
      // Título vira nó, sempre; e o sumário só cita título.
      if (traits.heading) expect(traits.approvesAs, kind).toBe("node");
      if (traits.inToc) expect(traits.heading, kind).toBe(true);
    }
  });
});
