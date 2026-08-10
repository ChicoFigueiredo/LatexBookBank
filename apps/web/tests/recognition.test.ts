import { describe, expect, it } from "vitest";

import {
  accept,
  candidateFrom,
  currentLatex,
  describeConfidence,
  edit,
  EmptyRecognitionError,
  NotReviewedError,
  reject,
} from "@modules/recognition/domain/recognition-review";
import { cleanLatex } from "@modules/recognition/infrastructure/vision-math-recognizer";
import type { MathRecognitionResult } from "@/shared/ports";

/**
 * **Nenhum caminho leva de "o modelo leu" a "está no acervo" sem um gesto humano no meio.**
 *
 * Um OCR de matemática acerta a maior parte e erra o expoente, e o erro é invisível para quem não
 * reconferir contra o recorte.
 *
 * Verificado com o `gemma3:12b` local sobre um recorte real: ele leu
 * `M = C(1 + i)^n - \frac{\sqrt{x^2 + 1}}{2n}` de uma imagem de
 * `M = C\left(1+i\right)^{n} - \frac{\sqrt{x^2+1}}{2n}` — equivalente, e compilando igual.
 */

const result = (over: Partial<MathRecognitionResult> = {}): MathRecognitionResult => ({
  latex: "M = C(1 + i)^n",
  confidence: null,
  alternatives: [],
  providerId: "openai-compatible-vision",
  model: "gemma3:12b",
  durationMs: 61_968,
  ...over,
});

describe("o candidato nasce candidato", () => {
  it("o estado inicial não é aceito", () => {
    expect(candidateFrom("crop-1", result()).state).toBe("candidate");
  });

  it("o recorte fica junto — nunca é descartado", () => {
    // D29: o crop é fonte. A próxima tentativa de reconhecimento parte dele.
    expect(candidateFrom("crop-1", result()).cropAssetId).toBe("crop-1");
    expect(reject(candidateFrom("crop-1", result())).cropAssetId).toBe("crop-1");
  });

  it("rejeitar não apaga nada", () => {
    // Apagar o crop ao rejeitar confundiria "esta transcrição está errada" com "este pedaço da
    // página não interessa".
    const rejected = reject(candidateFrom("crop-1", result()));

    expect(rejected.state).toBe("rejected");
    expect(rejected.result.latex).toBe("M = C(1 + i)^n");
  });
});

describe("aceitar exige revisão", () => {
  it("candidato intocado **não** pode ser aceito", () => {
    expect(() => accept(candidateFrom("crop-1", result()), false)).toThrow(NotReviewedError);
  });

  it("com o gesto de conferir, aceita", () => {
    expect(accept(candidateFrom("crop-1", result()), true).state).toBe("accepted");
  });

  it("editar move para `edited`, **não** para `accepted`", () => {
    // São gestos diferentes: corrigir o texto e afirmar que ele está certo. Fundi-los faria uma
    // correção interrompida por um telefonema virar dado aprovado.
    const edited = edit(candidateFrom("crop-1", result()), "M = C(1+i)^{n}");

    expect(edited.state).toBe("edited");
    expect(currentLatex(edited)).toBe("M = C(1+i)^{n}");
  });

  it("quem editou já olhou — aceita sem o clique de conferir", () => {
    const edited = edit(candidateFrom("crop-1", result()), "M = C(1+i)^{n}");
    expect(accept(edited, false).state).toBe("accepted");
  });

  it("LaTeX vazio não é aceito, nem depois de revisado", () => {
    expect(() => accept(candidateFrom("crop-1", result({ latex: "" })), true)).toThrow(
      EmptyRecognitionError,
    );
    expect(() => accept(edit(candidateFrom("crop-1", result()), "   "), true)).toThrow(
      EmptyRecognitionError,
    );
  });
});

describe("confiança", () => {
  it("`null` e zero são coisas diferentes", () => {
    // "Não tenho confiança" pede revisão atenta; "não sei medir" pede a mesma revisão sem alarme.
    // Um `0%` inventado para o caso `null` seria alerta falso.
    expect(describeConfidence(null)).toMatch(/sem medida/);
    expect(describeConfidence(0)).toMatch(/baixa/);
  });

  it("as faixas dizem o que fazer, não só o número", () => {
    expect(describeConfidence(0.95)).toMatch(/alta/);
    expect(describeConfidence(0.7)).toMatch(/vale conferir/);
    expect(describeConfidence(0.3)).toMatch(/com atenção/);
  });
});

describe("limpeza do que o modelo devolve", () => {
  it("tira cerca de código", () => {
    // Aparece em quase toda resposta, mesmo com o prompt pedindo o contrário.
    expect(cleanLatex("```latex\n\\frac{1}{2}\n```")).toBe("\\frac{1}{2}");
    expect(cleanLatex("```\nx^2\n```")).toBe("x^2");
  });

  it("tira delimitador de display e inline", () => {
    expect(cleanLatex("\\[ x^2 \\]")).toBe("x^2");
    expect(cleanLatex("$$x^2$$")).toBe("x^2");
    expect(cleanLatex("$x^2$")).toBe("x^2");
    expect(cleanLatex("\\(x^2\\)")).toBe("x^2");
  });

  it("**não** tira `$` de conteúdo misto", () => {
    // `$a$ e $b$` sem as pontas viraria `a$ e $b`, que é pior que o original.
    expect(cleanLatex("$a$ e $b$")).toBe("$a$ e $b$");
  });

  it("deixa em paz o que já está limpo", () => {
    const latex = "M = C(1 + i)^n - \\frac{\\sqrt{x^2 + 1}}{2n}";
    expect(cleanLatex(latex)).toBe(latex);
  });
});
