import { describe, expect, it } from "vitest";

import { relativeTime } from "@/shared/format/relative-time";

/** "Editado há 18 min" — a frase que a Home usa para dizer onde se parou. */

const at = (iso: string) => new Date(iso);
const NOW = at("2026-08-11T12:00:00.000Z");

describe("o tempo relativo", () => {
  it("arredonda o primeiro minuto para agora", () => {
    expect(relativeTime(at("2026-08-11T11:59:31.000Z"), NOW)).toBe("agora");
  });

  it("nunca devolve tempo negativo", () => {
    // Relógio do cliente adiantado: "há -3 s" seria pior que arredondar.
    expect(relativeTime(at("2026-08-11T12:00:30.000Z"), NOW)).toBe("agora");
  });

  it("conta minutos, horas, ontem e dias", () => {
    expect(relativeTime(at("2026-08-11T11:42:00.000Z"), NOW)).toBe("há 18 min");
    expect(relativeTime(at("2026-08-11T11:00:00.000Z"), NOW)).toBe("há 1 hora");
    expect(relativeTime(at("2026-08-11T08:00:00.000Z"), NOW)).toBe("há 4 horas");
    expect(relativeTime(at("2026-08-10T11:00:00.000Z"), NOW)).toBe("ontem");
    expect(relativeTime(at("2026-08-01T12:00:00.000Z"), NOW)).toBe("há 10 dias");
  });

  it("passa a meses e anos", () => {
    expect(relativeTime(at("2026-06-01T12:00:00.000Z"), NOW)).toBe("há 2 meses");
    expect(relativeTime(at("2024-08-11T12:00:00.000Z"), NOW)).toBe("há 2 anos");
  });
});
