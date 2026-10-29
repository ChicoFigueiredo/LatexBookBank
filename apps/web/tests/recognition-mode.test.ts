import { describe, expect, it } from "vitest";

import { isRecognitionMode, RECOGNITION_MODES } from "@modules/recognition/domain/recognition-mode";

/**
 * O modo do reconhecimento é vocabulário do domínio, com guarda de tipo.
 *
 * A rota repetia a lista num `Set` de strings e fazia `as RecognitionMode`: um modo novo na porta
 * e esquecido na rota virava `display` calado, e um modo tirado da porta passava pelo `as`.
 */
describe("o modo do reconhecimento", () => {
  it("são os quatro que a porta conhece", () => {
    expect([...RECOGNITION_MODES].sort()).toEqual(["display", "inline", "mixed", "text"]);
  });

  it.each(RECOGNITION_MODES)("`%s` é modo", (mode) => {
    expect(isRecognitionMode(mode)).toBe(true);
  });

  it.each(["questao", "DISPLAY", "", null, undefined, 1])("`%s` não é", (value) => {
    expect(isRecognitionMode(value)).toBe(false);
  });
});
