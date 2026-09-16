import { describe, expect, it } from "vitest";

import {
  segmentarPagina,
  type PaginaDeTexto,
  type PalavraNaPagina,
  type QuestaoEstimada,
} from "@modules/recognition/domain/segmentar-pagina";

import fixture from "./fixtures/profmat-ena-2023-p1-p2.json";

/**
 * A estimativa que decide se o botão "Estimar questões" poupa trabalho ou cria trabalho.
 *
 * O teste que importa é contra a prova de verdade — páginas 1 e 2 do ENA 2023 do ProfMat,
 * extraídas com `pdftotext -bbox`. Fixture sintética prova que o código roda; fixture real prova
 * que ele serve, e é ela que traz as armadilhas que ninguém inventaria de propósito: o título
 * "Gabarito com **Soluções**", o "Solução Alternativa" no meio de uma solução, o número da página
 * no rodapé, a fração cujo numerador é uma linha própria.
 *
 * Errar para menos é barato — falta um recorte e a pessoa desenha, como fazia antes. Errar para
 * mais custa mais do que o botão economiza: corrigir uma caixa torta dá mais trabalho do que
 * desenhar uma do zero. Por isso a maior parte destes testes guarda o que **não** deve ser
 * proposto.
 */

const paginas = fixture as readonly PaginaDeTexto[];
const pagina1 = paginas[0]!;
const pagina2 = paginas[1]!;

/** A caixa de volta a pontos do PDF, que é onde a fixture pode ser conferida a olho. */
const emPontos = (questao: QuestaoEstimada, pagina: PaginaDeTexto) => ({
  topo: questao.box.y * pagina.altura,
  base: (questao.box.y + questao.box.height) * pagina.altura,
});

/** O `y` da linha que começa com um texto — a âncora para conferir o que a caixa cobre. */
function yDaLinhaQueComecaCom(pagina: PaginaDeTexto, inicio: string): number {
  const palavras = [...pagina.palavras].sort((a, b) => a.y - b.y || a.x - b.x);
  const procurado = inicio.split(" ");

  for (const [indice, palavra] of palavras.entries()) {
    const seguintes = palavras
      .slice(indice, indice + procurado.length)
      .map((p) => p.texto)
      .join(" ");
    if (seguintes === inicio) return palavra.y;
  }

  throw new Error(`A fixture não tem uma linha começando por "${inicio}".`);
}

const contem = (questao: QuestaoEstimada, pagina: PaginaDeTexto, y: number): boolean => {
  const { topo, base } = emPontos(questao, pagina);

  return y >= topo && y <= base;
};

describe("a prova de verdade — ENA 2023, páginas 1 e 2", () => {
  it("acha as três questões da página 1, com os números impressos", () => {
    expect(segmentarPagina(pagina1).map((q) => q.numero)).toEqual([1, 2, 3]);
  });

  it("acha as duas questões da página 2, e a numeração continua de onde parou", () => {
    // A página 2 abre no meio da prova: nada aqui reinicia a contagem em 1, e o número tem de
    // sair do papel, não de um contador do código.
    expect(segmentarPagina(pagina2).map((q) => q.numero)).toEqual([4, 5]);
  });

  it('"Gabarito com Soluções" no título não vira questão', () => {
    // A armadilha real da página 1: a palavra do título parece o marcador de solução e não é.
    // Se virasse marcador, a primeira caixa começaria no cabeçalho e todo recorte da página
    // sairia deslocado.
    const estimadas = segmentarPagina(pagina1);
    const titulo = yDaLinhaQueComecaCom(pagina1, "ENA");

    for (const questao of estimadas) {
      expect(contem(questao, pagina1, titulo)).toBe(false);
    }
    expect(emPontos(estimadas[0]!, pagina1).topo).toBeGreaterThan(titulo);
  });

  it("cada caixa cobre a solução da sua questão, e só a dela", () => {
    // É a conferência que vale contra o documento: a caixa da questão 1 tem de conter
    // "Solução da questão 1" e não pode encostar na 2. Contagem certa com caixa deslocada
    // passaria em todos os outros testes.
    for (const pagina of [pagina1, pagina2]) {
      const estimadas = segmentarPagina(pagina);

      for (const questao of estimadas) {
        for (const outra of estimadas) {
          const solucao = yDaLinhaQueComecaCom(pagina, `Solução da questão ${outra.numero}`);

          expect(contem(questao, pagina, solucao)).toBe(questao.numero === outra.numero);
        }
      }
    }
  });

  it("a caixa da questão começa no enunciado dela", () => {
    const estimadas = segmentarPagina(pagina1);

    for (const questao of estimadas) {
      const enunciado = yDaLinhaQueComecaCom(pagina1, `${questao.numero}.`);
      const { topo } = emPontos(questao, pagina1);

      expect(topo).toBeLessThanOrEqual(enunciado);
      // A folga é pequena: começar meia página acima cobriria a questão anterior inteira.
      expect(enunciado - topo).toBeLessThan(20);
    }
  });

  it('"Solução Alternativa" fica dentro da questão 5, e não abre uma sexta', () => {
    // O documento tem esse subtítulo no meio da solução da questão 5. Ele começa com a mesma
    // palavra do marcador e não é marcador nenhum.
    const estimadas = segmentarPagina(pagina2);
    const alternativa = yDaLinhaQueComecaCom(pagina2, "Solução Alternativa");

    expect(estimadas).toHaveLength(2);
    expect(contem(estimadas[1]!, pagina2, alternativa)).toBe(true);
  });

  it("o número da página no rodapé fica de fora do recorte", () => {
    // A página 2 termina com um "2" solto, a 40 pontos da última linha do corpo. Dentro do
    // recorte ele viraria um algarismo perdido no fim da solução, e alguém teria de apagá-lo.
    const estimadas = segmentarPagina(pagina2);
    const rodape = 827.4;

    for (const questao of estimadas) {
      expect(contem(questao, pagina2, rodape)).toBe(false);
    }
  });

  it("as caixas ficam dentro da página, em 0..1", () => {
    for (const pagina of [pagina1, pagina2]) {
      for (const { box } of segmentarPagina(pagina)) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.width).toBeGreaterThan(0);
        expect(box.height).toBeGreaterThan(0);
        expect(box.x + box.width).toBeLessThanOrEqual(1);
        expect(box.y + box.height).toBeLessThanOrEqual(1);
      }
    }
  });

  it("as caixas não se sobrepõem", () => {
    // Duas propostas sobrepostas dariam dois recortes com a mesma questão dentro, e a pessoa
    // descobriria isso só depois de reconhecer as duas.
    for (const pagina of [pagina1, pagina2]) {
      const estimadas = segmentarPagina(pagina);

      for (const [indice, questao] of estimadas.entries()) {
        const proxima = estimadas[indice + 1];
        if (!proxima) continue;

        expect(questao.box.y + questao.box.height).toBeLessThanOrEqual(proxima.box.y);
      }
    }
  });

  it("a caixa cobre a largura da coluna impressa, não a de cada bloco", () => {
    // Enunciado curto e solução com fração larga têm larguras diferentes; recorte com larguras
    // diferentes fica torto na tela, e o bbox da palavra não inclui o traço da fração — colar a
    // caixa no bloco corta o traço.
    const larguras = new Set(segmentarPagina(pagina1).map((q) => q.box.width));

    expect(larguras.size).toBe(1);
  });

  it("a razão diz o que fechou cada caixa", () => {
    const [primeira, segunda, terceira] = segmentarPagina(pagina1);

    expect(primeira?.razao).toBe("enunciado-ate-solucao");
    expect(segunda?.razao).toBe("enunciado-ate-solucao");
    // A caixa da última questão não foi fechada por outro marcador: foi a página que acabou.
    expect(terceira?.razao).toBe("sobra-final");
  });

  it("questão inteira que termina no pé da página não é dada como continuada", () => {
    // A questão 3 vai até o fim da mancha de texto, e a página 2 começa na questão 4 — ela não
    // continua. Medido no documento inteiro: só a geometria avisaria em 7 das 30 questões, e uma
    // única continua de verdade. Seis alarmes falsos ensinariam a ignorar o sétimo.
    for (const pagina of [pagina1, pagina2]) {
      for (const questao of segmentarPagina(pagina)) {
        expect(questao.continuaNaProxima).toBe(false);
      }
    }
  });

  it("a caixa vai do enunciado até o fim da solução, e não até as alternativas", () => {
    // O dono quer capturar a questão completa. Cortar nas alternativas deixaria a solução órfã
    // na página, e ela é metade do valor deste acervo.
    const [primeira] = segmentarPagina(pagina1);
    const { topo, base } = emPontos(primeira!, pagina1);

    expect(topo).toBeLessThan(yDaLinhaQueComecaCom(pagina1, "(A)"));
    expect(base).toBeGreaterThan(yDaLinhaQueComecaCom(pagina1, "Resposta:"));
  });
});

/**
 * Páginas que a prova tem e que não rendem proposta nenhuma.
 *
 * Lista vazia é resposta, não falha: a pessoa desenha, como já desenhava. Uma proposta errada
 * numa página de capa custa mais que a ausência de proposta.
 */
describe("página sem marcador nenhum", () => {
  const recorteDe = (pagina: PaginaDeTexto, de: number, ate: number): PaginaDeTexto => ({
    largura: pagina.largura,
    altura: pagina.altura,
    palavras: pagina.palavras.filter((p) => p.y >= de && p.y <= ate),
  });

  it("só o cabeçalho da prova devolve vazio", () => {
    expect(segmentarPagina(recorteDe(pagina1, 0, 100))).toEqual([]);
  });

  it("página só de solução devolve vazio", () => {
    // Acontece de verdade: uma solução longa toma a página inteira sem nenhum enunciado. Propor
    // o pedaço seria propor meia questão.
    const soSolucao = recorteDe(pagina1, 700, 841.89);

    expect(soSolucao.palavras.length).toBeGreaterThan(0);
    expect(segmentarPagina(soSolucao)).toEqual([]);
  });

  it("página em branco devolve vazio", () => {
    expect(segmentarPagina({ largura: 595.28, altura: 841.89, palavras: [] })).toEqual([]);
  });
});

/**
 * Os casos de borda, em papel sintético.
 *
 * A geometria imita a da prova real: A4 em pontos, margem em 51, corpo de 9.9 e entrelinha de 20.
 */
describe("casos de borda", () => {
  const A4 = { largura: 595.28, altura: 841.89 };
  const MARGEM = 51;
  const ALTURA = 9.9;
  const ENTRELINHA = 20;

  /** Uma página com as linhas empilhadas, cada palavra com largura plausível. */
  function paginaCom(
    linhas: readonly (string | { readonly texto: string; readonly x: number })[],
    primeiroY = 55,
  ): PaginaDeTexto {
    const palavras: PalavraNaPagina[] = [];

    for (const [indice, linha] of linhas.entries()) {
      const { texto, x } = typeof linha === "string" ? { texto: linha, x: MARGEM } : linha;
      let cursor = x;

      for (const palavra of texto.split(" ")) {
        palavras.push({
          texto: palavra,
          x: cursor,
          y: primeiroY + indice * ENTRELINHA,
          largura: palavra.length * 5,
          altura: ALTURA,
        });
        cursor += palavra.length * 5 + 3;
      }
    }

    return { ...A4, palavras };
  }

  it("um número no meio de uma conta não abre questão", () => {
    // "5 · 12" é o numerador de uma fração, centrado. Só o que está na margem esquerda pode
    // abrir questão — é isso que separa marcador de aritmética.
    const estimadas = segmentarPagina(
      paginaCom([
        "1. Calcule a área do triângulo.",
        { texto: "2. isto é um numerador, não uma questão", x: 163 },
        "Portanto a área é 30.",
      ]),
    );

    expect(estimadas.map((q) => q.numero)).toEqual([1]);
  });

  it("separador de milhar não é marcador de questão", () => {
    // "1.500 reais" na margem tem a mesma cara de "1. Enunciado" para uma regex descuidada.
    const estimadas = segmentarPagina(
      paginaCom(["1. Um capital foi aplicado.", "2.500 reais renderam juros no primeiro mês."]),
    );

    expect(estimadas.map((q) => q.numero)).toEqual([1]);
  });

  it("marcador fora de ordem é descartado, e a sequência boa fica", () => {
    // Um "3." enumerando casos dentro de uma solução não recomeça a prova.
    const estimadas = segmentarPagina(
      paginaCom([
        "7. Primeira questão desta página.",
        "3. este número quebra a ordem e não é enunciado",
        "8. Segunda questão desta página.",
      ]),
    );

    expect(estimadas.map((q) => q.numero)).toEqual([7, 8]);
  });

  it("acento decomposto ainda é reconhecido — o texto do PDF vem em NFD", () => {
    // Bug real e silencioso deste projeto: "Solução" saído do LaTeX vem com o cedilha e o til
    // como marcas separadas, e a regex com acento não casa. Sem a normalização, este teste
    // devolve "enunciado-ate-proximo" e ninguém percebe.
    const decomposto = "Solução da questão 1".normalize("NFD");
    expect(decomposto).not.toBe("Solução da questão 1");

    const estimadas = segmentarPagina(
      paginaCom([
        "1. Enunciado da primeira.",
        decomposto,
        "Resposta: C",
        "2. Enunciado da segunda.",
        "Solução da questão 2",
        "Resposta: A",
      ]),
    );

    expect(estimadas[0]?.razao).toBe("enunciado-ate-solucao");
  });

  it("sem marcador de solução, a caixa vai até a próxima questão", () => {
    // Prova crua, sem gabarito — metade do acervo é assim.
    const estimadas = segmentarPagina(
      paginaCom(["1. Enunciado da primeira.", "(A) 28.", "2. Enunciado da segunda.", "(A) 14%."]),
    );

    expect(estimadas.map((q) => q.razao)).toEqual([
      "enunciado-ate-proximo",
      "enunciado-ate-proximo",
    ]);
  });

  it("número que a página contradiz não é afirmado", () => {
    // O enunciado diz "1." e a solução dentro da mesma caixa diz "questão 7". Uma das duas
    // leituras está errada e daqui não dá para saber qual — inventar um número faria a questão
    // entrar no acervo citada errado.
    const estimadas = segmentarPagina(
      paginaCom([
        "1. Enunciado da primeira.",
        "Solução da questão 7",
        "Resposta: C",
        "2. Enunciado da segunda.",
        "Solução da questão 2",
      ]),
    );

    expect(estimadas[0]?.numero).toBeNull();
    expect(estimadas[1]?.numero).toBe(2);
  });

  it("página que acaba no meio não sinaliza continuação", () => {
    // Fim de bloco com meia página em branco embaixo: dá para ver onde a questão termina, e
    // avisar "continua" aqui seria mandar a pessoa conferir uma página que não existe.
    const estimadas = segmentarPagina(paginaCom(["1. Enunciado curto.", "(A) 28.", "(B) 29."]));

    expect(estimadas).toHaveLength(1);
    expect(estimadas[0]?.continuaNaProxima).toBe(false);
    expect(estimadas[0]?.razao).toBe("enunciado-ate-proximo");
  });

  it("aceita a forma `Questão 12`, que outras provas do acervo usam", () => {
    const estimadas = segmentarPagina(
      paginaCom(["Questão 12. Enunciado.", "(A) 28.", "QUESTÃO 13 Enunciado.", "(A) 14%."]),
    );

    expect(estimadas.map((q) => q.numero)).toEqual([12, 13]);
  });

  it("bloco cortado pelo fim da página é sinalizado; bloco inteiro no pé, não", () => {
    // O caso real da questão 28: enunciado e alternativas na página 15, solução só na 16. O que
    // separa esse bloco de uma questão que apenas termina no pé da página é a solução dela estar
    // dentro da caixa.
    const enchimento = Array.from({ length: 33 }, (_, i) => `Linha ${i} da solução da primeira.`);
    const ate = (ultimas: readonly string[]) =>
      segmentarPagina(paginaCom(["1. Enunciado da primeira.", ...enchimento, ...ultimas]));

    const cortada = ate(["30. Enunciado que a página corta.", "(A) 28.", "(B) 29."]);
    expect(cortada[1]?.razao).toBe("sobra-final");
    expect(cortada[1]?.continuaNaProxima).toBe(true);

    const inteira = ate(["30. Enunciado inteiro.", "Solução da questão 30", "Resposta: C"]);
    expect(inteira[1]?.razao).toBe("sobra-final");
    expect(inteira[1]?.continuaNaProxima).toBe(false);
  });

  it("uma questão sozinha na página ainda é proposta", () => {
    expect(segmentarPagina(paginaCom(["1. Única.", "(A) 28."]))).toHaveLength(1);
  });
});
