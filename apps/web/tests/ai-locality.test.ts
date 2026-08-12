import { describe, expect, it } from "vitest";

import {
  fraseDaLocalidade,
  localidadeDaIa,
} from "@modules/agents/domain/ai-locality";

/**
 * A pergunta é feita num momento sensível: alguém prestes a subir a página de um livro protegido.
 *
 * Errar para "local" é a única falha que este módulo não pode ter — seria o app prometendo que
 * nada sai da máquina enquanto manda o recorte para fora. Errar para "remota" custa um aviso a
 * mais; errar para "local" custa a confiança e, dependendo do material, mais que isso.
 */

describe("localidadeDaIa", () => {
  it("loopback é esta máquina, em todas as formas", () => {
    for (const url of [
      "http://localhost:11434",
      "http://127.0.0.1:11434/v1",
      "http://[::1]:11434",
      "https://LOCALHOST:8080",
    ]) {
      expect(localidadeDaIa(url), url).toBe("local");
    }
  });

  it("host remoto é remoto, mesmo com nome de provider local", () => {
    // "Ollama local" é o nome de um **perfil de configuração**, não uma garantia: nada impede
    // apontar `AI_BASE_URL` para um Ollama noutra máquina, e aí o recorte sai.
    expect(localidadeDaIa("http://ollama.rede-interna:11434")).toBe("remota");
    expect(localidadeDaIa("https://api.openai.com/v1")).toBe("remota");
  });

  it("sem base url é “sem-ia”, e não “local”", () => {
    // Não há reconhecimento nenhum. Dizer "roda no seu computador" seria prometer um recurso que
    // não existe.
    expect(localidadeDaIa(null)).toBe("sem-ia");
    expect(localidadeDaIa("")).toBe("sem-ia");
  });

  it("URL que não parseia cai em “remota” — não afirmar é a resposta segura", () => {
    // Entre calar sobre uma garantia e prometer uma que não se pode conferir, cala-se.
    expect(localidadeDaIa("nao-e-uma-url")).toBe("remota");
  });
});

describe("fraseDaLocalidade", () => {
  it("local promete, e é a única que promete", () => {
    expect(fraseDaLocalidade("local", "Ollama local")).toBe(
      "O reconhecimento roda no seu computador. Nada é enviado para fora.",
    );
  });

  it("remota nomeia o destino — “sai do seu computador” sem dizer para onde não dá para agir", () => {
    expect(fraseDaLocalidade("remota", "OpenRouter")).toContain("por OpenRouter");
    expect(fraseDaLocalidade("remota", "OpenRouter")).toContain("sai do seu computador");
  });

  it("remota sem nome do provider ainda avisa", () => {
    expect(fraseDaLocalidade("remota", null)).toContain("serviço externo");
  });

  it("sem ia diz o que ainda dá para fazer, em vez de só o que falta", () => {
    expect(fraseDaLocalidade("sem-ia", null)).toContain("transcrever à mão");
  });
});
