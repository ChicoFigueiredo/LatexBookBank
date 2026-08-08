import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  buildRenderBundle,
  type QuestionForRender,
} from "@modules/rendering/domain/build-render-bundle";
import {
  LEGACY_COMPATIBILITY_PROFILE,
  QUESTION_PREVIEW_PROFILE,
  profileById,
  RENDER_PROFILES,
} from "@modules/rendering/domain/latex-profile";

const question = (over: Partial<QuestionForRender> = {}): QuestionForRender => ({
  id: "q1",
  statementLatex: "Quanto é $2+2$?",
  solutionLatex: "É $4$.",
  complementLatex: "",
  options: [],
  ...over,
});

describe("perfis", () => {
  it("o preview é bem menor que o legado", () => {
    // Carregar `abntex2cite`, `backref` e `rotating` para desenhar três linhas custa segundos que
    // a pessoa espera olhando.
    expect(QUESTION_PREVIEW_PROFILE.preamble.length).toBeLessThan(
      LEGACY_COMPATIBILITY_PROFILE.preamble.length / 2,
    );
  });

  it("o preview recorta no conteúdo", () => {
    // Uma questão de quatro linhas numa folha A4 vira uma imagem que é 90% branco.
    expect(QUESTION_PREVIEW_PROFILE.documentClass).toBe("standalone");
    expect(QUESTION_PREVIEW_PROFILE.documentClassOptions).toContain("preview");
  });

  it("os dois trazem as macros que o acervo usa", () => {
    // `\colorcancel` aparece nas questões de álgebra; sem ela, elas param de compilar.
    for (const profile of RENDER_PROFILES) {
      expect(profile.preamble.some((line) => line.includes("colorcancel"))).toBe(true);
    }
  });

  it("`profileById` não inventa perfil", () => {
    expect(profileById("legacy-compatibility")).not.toBeNull();
    expect(profileById("inexistente")).toBeNull();
  });
});

/**
 * O perfil legado contra o arquivo real.
 *
 * O `latex-includes.tex` do `LatexRender5` compilou o acervo por vinte anos. Este teste lê o
 * arquivo **se ele estiver na máquina** e confere que nenhum package foi esquecido na cópia — o
 * tipo de erro que só aparece quando uma questão específica para de compilar, meses depois.
 *
 * Fora da máquina de desenvolvimento o arquivo não existe, e o teste se declara pulado em vez de
 * falhar: o CI não tem o acervo legado, e um teste vermelho por isso viraria ruído até alguém
 * desativá-lo.
 */
const LEGACY_PREAMBLE_PATH =
  process.env["LEGACY_LATEX_PREAMBLE"] ??
  "/mnt/d/Chico/banco-questoes.windows/LatexRender5/latex-includes.tex";

function readLegacyPreamble(): string | null {
  try {
    return readFileSync(fileURLToPath(new URL(`file://${LEGACY_PREAMBLE_PATH}`)), "utf8");
  } catch {
    return null;
  }
}

describe("Legacy Compatibility × latex-includes.tex", () => {
  const legacy = readLegacyPreamble();

  it.skipIf(legacy === null)("não esqueceu nenhum package do arquivo original", () => {
    const wanted = [...(legacy ?? "").matchAll(/^\s*\\usepackage(?:\[[^\]]*\])?\{([^}]+)\}/gm)]
      .flatMap((match) => (match[1] ?? "").split(",").map((name) => name.trim()))
      .filter(Boolean);

    const declared = LEGACY_COMPATIBILITY_PROFILE.preamble.join("\n");

    // As quatro ausências são decisões registradas, não esquecimento:
    //   iwona          — só em `texlive-fonts-extra`, 1,41 GB (a nota está no perfil)
    //   inline-images  — baixa imagem da internet, que o worker não tem por decisão (D35)
    //   lipsum         — gera texto de exemplo; não tem lugar num acervo de verdade
    //   abntex2cite    — presente, mas o legado o declara duas vezes (com `alf` comentado)
    const known = new Set(["iwona", "inline-images", "lipsum"]);

    const missing = [...new Set(wanted)].filter(
      (name) =>
        !known.has(name) &&
        !declared.includes(`{${name}}`) &&
        !declared.includes(`,${name}`) &&
        !declared.includes(`${name},`),
    );

    expect(missing).toEqual([]);
  });
});

describe("buildRenderBundle", () => {
  it("monta o corpo com enunciado e alternativas", () => {
    const bundle = buildRenderBundle({
      jobId: "j1",
      question: question({
        options: [
          { statementLatex: "3", isCorrect: false },
          { statementLatex: "4", isCorrect: true },
        ],
      }),
      profile: QUESTION_PREVIEW_PROFILE,
    });

    expect(bundle.sourceLatex).toContain("Quanto é $2+2$?");
    expect(bundle.sourceLatex).toContain("\\begin{enumerate}");
    expect(bundle.sourceLatex).toContain("\\item 4");
  });

  it("a letra vem do `label`, nunca escrita no texto", () => {
    // D9: escrevê-la reintroduziria o erro do legado — reordenar deixava o gabarito apontando
    // para a letra errada.
    const bundle = buildRenderBundle({
      jobId: "j1",
      question: question({ options: [{ statementLatex: "3", isCorrect: false }] }),
      profile: QUESTION_PREVIEW_PROFILE,
    });

    expect(bundle.sourceLatex).toContain("label=\\alph*)");
    expect(bundle.sourceLatex).not.toMatch(/^\s*a\)/m);
  });

  it("omite a resposta por padrão", () => {
    // É o que se mostra ao aluno; incluir o gabarito por engano seria o pior defeito possível.
    const bundle = buildRenderBundle({
      jobId: "j1",
      question: question(),
      profile: QUESTION_PREVIEW_PROFILE,
    });

    expect(bundle.sourceLatex).not.toContain("Resposta");
  });

  it("inclui a resposta quando pedido", () => {
    const bundle = buildRenderBundle({
      jobId: "j1",
      question: question(),
      profile: QUESTION_PREVIEW_PROFILE,
      includeSolution: true,
    });

    expect(bundle.sourceLatex).toContain("\\textbf{Resposta.} É $4$.");
  });

  it("não deixa parágrafo vazio no fim", () => {
    // Num `standalone` com `preview`, isso vira espaço extra embaixo do recorte.
    const bundle = buildRenderBundle({
      jobId: "j1",
      question: question({ statementLatex: "texto\n\n" }),
      profile: QUESTION_PREVIEW_PROFILE,
    });

    expect(bundle.sourceLatex.endsWith("texto")).toBe(true);
  });

  it("questão sem alternativas não gera lista vazia", () => {
    // `\begin{enumerate}\end{enumerate}` vazio é erro de LaTeX, não elemento invisível.
    const bundle = buildRenderBundle({
      jobId: "j1",
      question: question(),
      profile: QUESTION_PREVIEW_PROFILE,
    });

    expect(bundle.sourceLatex).not.toContain("enumerate");
  });
});
