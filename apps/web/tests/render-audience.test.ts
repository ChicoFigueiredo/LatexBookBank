import { describe, expect, it } from "vitest";

import {
  staleAudienceWarning,
  includesSolution,
  downloadFileName,
  audienceSummary,
  RENDER_AUDIENCES,
} from "@modules/rendering/domain/render-audience";

/**
 * A saída do render — `Aluno` e `Professor`.
 *
 * O app sabia compilar as duas desde sempre: `includeSolution` atravessa rota, bundle e plugins. O
 * editor nunca pedia, então o PDF autoritativo nunca saiu com a resolução dentro — e nada na tela
 * dizia que existia outra saída.
 *
 * O que estes testes guardam é a **segunda** metade, que é a de segurança: um resultado compilado
 * numa saída não pode passar por resultado da outra.
 */

describe("includesSolution", () => {
  it("só o professor leva gabarito e resolução", () => {
    expect(includesSolution("professor")).toBe(true);
    expect(includesSolution("aluno")).toBe(false);
  });

  it("as duas saídas existem, e nessa ordem", () => {
    // A ordem importa na pílula: `Aluno` primeiro porque é o padrão, e o padrão é o que não
    // vaza gabarito por engano.
    expect(RENDER_AUDIENCES.map((saida) => saida.id)).toEqual(["aluno", "professor"]);
  });
});

describe("audienceSummary", () => {
  it("diz o que entra no papel, não para quem serve", () => {
    // “versão do professor” é um rótulo em que se acredita; “gabarito · resolução” é conferível
    // olhando o resultado.
    expect(audienceSummary("professor")).toContain("gabarito");
    expect(audienceSummary("professor")).toContain("resolução");
    expect(audienceSummary("aluno")).not.toContain("gabarito");
  });
});

describe("staleAudienceWarning", () => {
  it("**avisa** quando o que está na tela é da outra saída", () => {
    const aviso = staleAudienceWarning("professor", "aluno");

    expect(aviso).toContain("Aluno");
    expect(aviso).toContain("Professor");
    // A frase precisa terminar em ação: saber que está desatualizado sem saber o que fazer é
    // meio aviso.
    expect(aviso).toContain("Compile de novo");
  });

  it("cala quando o resultado é da saída escolhida", () => {
    expect(staleAudienceWarning("aluno", "aluno")).toBeNull();
    expect(staleAudienceWarning("professor", "professor")).toBeNull();
  });

  it("cala quando não há resultado nenhum na tela", () => {
    // Um aviso sobre um PDF que não existe é moldura — e moldura não é lida no dia em que
    // importa.
    expect(staleAudienceWarning("professor", null)).toBeNull();
  });
});

describe("downloadFileName", () => {
  it("o arquivo baixado carrega a saída no nome", () => {
    // Dois PDFs da mesma questão na pasta de downloads com o mesmo nome são indistinguíveis
    // exatamente quando a diferença importa: um tem o gabarito e o outro não.
    expect(downloadFileName("3f2a91c4-aaaa-bbbb-cccc-ddddeeeeffff", "professor", "pdf")).toBe(
      "questao-3f2a91c4-professor.pdf",
    );
    expect(downloadFileName("3f2a91c4-aaaa-bbbb-cccc-ddddeeeeffff", "aluno", "png")).toBe(
      "questao-3f2a91c4-aluno.png",
    );
  });
});
