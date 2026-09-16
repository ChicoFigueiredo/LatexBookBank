/**
 * Onde estão as questões numa página de PDF que já veio com camada de texto.
 *
 * O produto captura questão por recorte manual: desenhar o retângulo, reconhecer, revisar. O botão
 * "Estimar questões" existe para poupar o desenho — e o que o torna possível é uma descoberta
 * sobre o acervo, não um modelo: os PDFs saem do LaTeX **com camada de texto**. Isto aqui não é
 * visão computacional; é aritmética sobre as coordenadas das palavras que o arquivo já carrega.
 *
 * Nada aqui recorta, renderiza ou lê arquivo — quem faz isso é a tela, com `pdf.js`. A função
 * devolve **propostas**: caixas normalizadas 0..1 (D28) que a pessoa aceita, ajusta ou descarta.
 *
 * A assimetria que explica todas as regras abaixo: errar para menos é barato — falta uma proposta
 * e a pessoa desenha, como já fazia. Errar para mais custa mais do que o botão economiza, porque
 * corrigir uma caixa torta dá mais trabalho do que desenhar uma do zero. Por isso cada regra
 * recusa mais do que aceita, e página sem marcador reconhecível devolve lista vazia — que é uma
 * resposta, não uma falha.
 *
 * Mesmo espírito de `separar-alternativas.ts`: regra explícita e testada contra o documento real,
 * em vez de um prompt que às vezes obedece.
 */

/** Uma palavra da camada de texto, em pontos do PDF, origem no topo-esquerda. */
export interface PalavraNaPagina {
  readonly texto: string;
  readonly x: number;
  readonly y: number;
  readonly largura: number;
  readonly altura: number;
}

export interface PaginaDeTexto {
  readonly largura: number;
  readonly altura: number;
  readonly palavras: readonly PalavraNaPagina[];
}

/** Um recorte proposto — a caixa é normalizada 0..1, como manda o D28. */
export interface QuestaoEstimada {
  /** O número impresso na prova, quando dá para afirmar. Nunca inventado. */
  readonly numero: number | null;
  /** Caixa normalizada 0..1 sobre a página: {x, y, width, height}. */
  readonly box: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  /** Por que este recorte foi proposto — some na tela como explicação, e serve ao teste. */
  readonly razao: "enunciado-ate-solucao" | "enunciado-ate-proximo" | "sobra-final";
  /**
   * `true` quando a questão claramente continua na página seguinte: a caixa vai até o pé da mancha
   * de texto **e** o bloco está visivelmente cortado. Os dois sinais, e o porquê de não bastar o
   * primeiro, estão medidos no cálculo.
   */
  readonly continuaNaProxima: boolean;
}

/**
 * O que abre uma questão, na prova de verdade.
 *
 * Duas formas, e nenhuma genérica: `1.` no começo da linha (o ProfMat e quase todo enunciado
 * numerado em LaTeX) e `Questão 12` (as provas que trazem a palavra escrita).
 *
 * O `(?!\d)` não é preciosismo — é o separador de milhar. `1.500 reais renderam` começa a linha
 * exatamente como `1. Um capital`, e sem essa recusa toda quantia em real viraria uma questão.
 *
 * O que ficou **de fora** de propósito: `1)`. Ele é indistinguível da enumeração de casos dentro
 * de uma solução (`1) se x > 0 ...`), e aceitá-lo trocaria uma proposta a mais por uma proposta
 * errada no meio da página — o lado caro do erro.
 */
const ENUNCIADO_NUMERADO = /^(\d{1,3})\.(?!\d)/;
const ENUNCIADO_ESCRITO = /^quest[ãa]o\s*(?:n[ºo°]?\.?\s*)?(\d{1,3})(?!\d)/i;

/**
 * O marcador de solução — e a armadilha que ele desarma.
 *
 * A página 1 da prova tem, no título, "ENA – 2023 – Gabarito com **Soluções**". Um marcador que
 * procurasse a palavra "Solução" acharia o título e faria a primeira caixa começar no cabeçalho.
 * Por isso o marcador é a frase inteira, ancorada no começo da linha e **com o número**: o que
 * abre solução é `Solução da questão 4`, não a palavra solta.
 *
 * A mesma exigência protege de "Solução Alternativa", que a questão 5 tem no meio da própria
 * solução e que não abre nada.
 */
const SOLUCAO_DA_QUESTAO = /^solu[çc][ãa]o\s+d[ae]\s+quest[ãa]o\s*(\d{1,3})(?!\d)/i;

/**
 * Meia altura de fonte para juntar palavras na mesma linha.
 *
 * Derivado da fonte, e não constante: a prova mistura corpo de 9.9 com sobrescrito de 6.4, e uma
 * tolerância fixa ou juntaria numerador com denominador de fração, ou separaria a mesma linha em
 * duas. Meia altura junta o sobrescrito à linha dele e deixa o numerador da fração como linha
 * própria — que é o que ele é.
 */
const TOLERANCIA_DE_LINHA = 0.5;

/** A folga do recorte, também em altura de fonte: respira sem invadir o vizinho. */
const FOLGA_DA_CAIXA = 0.5;

/**
 * O quanto a margem esquerda pode variar e ainda ser a margem.
 *
 * A prova real alterna 51.0 e 51.1 na mesma coluna — arredondamento do PDF. O que esta tolerância
 * **não** pode fazer é alcançar o texto centrado: o numerador `5 · 12` está em 163, e é a distância
 * até a margem que o impede de virar questão.
 */
const TOLERANCIA_DA_MARGEM = 0.5;

/** O vão, em entrelinhas, que separa rodapé de texto. */
const VAO_DE_RODAPE = 1.6;

/**
 * Lê a página e devolve o que dá para afirmar.
 *
 * A caixa de uma questão vai do enunciado **até o fim do bloco de solução** — e a escolha é do
 * dono do acervo: o que ele quer capturar é a questão completa, enunciado e alternativas e
 * solução. Cortar nas alternativas deixaria a solução órfã na página, e ela é metade do valor
 * deste acervo; quem quiser só o enunciado tira a solução depois, no editor, que é barato.
 */
export function segmentarPagina(pagina: PaginaDeTexto): readonly QuestaoEstimada[] {
  if (pagina.largura <= 0 || pagina.altura <= 0) return [];

  const linhas = agruparEmLinhas(pagina.palavras);
  const primeira = linhas[0];
  if (!primeira) return [];

  const alturaTipica = mediana(linhas.map((linha) => linha.altura));
  const entrelinha = entrelinhaDe(linhas, alturaTipica);

  // A página não diz onde termina a mancha de texto, mas diz onde ela começa — e livro nenhum
  // deste acervo tem margem de baixo menor que a de cima. Espelhar a margem superior dá o limite
  // do corpo sem chutar constante, e é ele que separa rodapé de texto e responde se a última
  // questão foi até o fim da página.
  const limiteDoCorpo = pagina.altura - primeira.topo;
  const corpo = semRodape(linhas, limiteDoCorpo, entrelinha);

  const marcadores = maiorSequenciaCrescente(marcadoresDeEnunciado(corpo, alturaTipica));
  if (marcadores.length === 0) return [];

  const blocos = marcadores.map((marcador, ordem) => {
    const fim = marcadores[ordem + 1]?.indice ?? corpo.length;

    return { marcador, linhas: corpo.slice(marcador.indice, fim) };
  });

  // A largura é a da **coluna impressa**, e a mesma para todas as propostas da página. Colar cada
  // caixa no bloco dela daria recortes de larguras diferentes, e pior: o bbox da palavra não
  // inclui o traço da fração nem o radical, então caixa apertada corta o que ninguém vê no texto.
  const primeiroMarcador = marcadores[0]?.indice ?? 0;
  const coluna = corpo.slice(primeiroMarcador);
  const esquerda = Math.min(...coluna.map((linha) => linha.esquerda));
  const direita = Math.max(...coluna.map((linha) => linha.direita));
  const folga = alturaTipica * FOLGA_DA_CAIXA;

  const extremos = blocos.map(({ linhas: doBloco }) => ({
    topo: Math.min(...doBloco.map((linha) => linha.topo)),
    base: Math.max(...doBloco.map((linha) => linha.base)),
  }));

  const estimadas: QuestaoEstimada[] = [];

  for (const [ordem, bloco] of blocos.entries()) {
    const atual = extremos[ordem];
    if (!atual) continue;

    const anterior = extremos[ordem - 1];
    const proximo = extremos[ordem + 1];

    // A folga nunca passa do meio do vão até o vizinho: duas propostas sobrepostas dariam dois
    // recortes com a mesma questão dentro, e isso só apareceria depois de reconhecer os dois.
    const topo = anterior
      ? Math.max(atual.topo - folga, (anterior.base + atual.topo) / 2)
      : atual.topo - folga;
    const base = proximo
      ? Math.min(atual.base + folga, (atual.base + proximo.topo) / 2)
      : atual.base + folga;
    if (base <= topo) continue;

    // A caixa acabou porque a página acabou, e não porque outro marcador a fechou: daqui não dá
    // para ver onde a questão termina.
    const chegaAoFimDaMancha = !proximo && atual.base >= limiteDoCorpo - entrelinha;
    const solucoes = bloco.linhas
      .map((linha) => numeroDaSolucao(linha))
      .filter((numero): numero is number => numero !== null);

    // O aviso de continuação pede os **dois** sinais, e o segundo foi medido no documento inteiro:
    // só a geometria avisava em 7 das 30 questões, e apenas 1 continuava de verdade. Seis alarmes
    // falsos não são um custo pequeno — um alarme falso ensina a ignorar alarmes, e o sétimo, que
    // é o verdadeiro, passa batido.
    //
    // O segundo sinal é a solução da própria questão dentro da caixa: com ela, o que se vê na
    // página é uma questão inteira que por acaso termina no pé; sem ela, o bloco está visivelmente
    // cortado — foi o caso da questão 28, cuja solução só começa na página seguinte. Numa prova
    // crua, sem gabarito, nenhum bloco tem marcador de solução e o aviso volta a ser só geométrico,
    // que é o comportamento conservador certo quando não há mais o que ler.
    //
    // O que este par **não** pega: uma solução cujo título ficou nesta página e cujo fim virou a
    // página. Não acontece nesta prova, e o preço de errar aí é uma conferida a menos — não uma
    // caixa errada.
    const continuaNaProxima = chegaAoFimDaMancha && !solucoes.includes(bloco.marcador.numero);

    estimadas.push({
      // O número só é afirmado quando nada na página o contradiz. Enunciado dizendo `1.` com
      // "Solução da questão 7" dentro da mesma caixa é uma leitura errada, e não dá para saber
      // qual das duas — a questão entraria no acervo citada com o número de outra.
      numero: solucoes.some((numero) => numero !== bloco.marcador.numero)
        ? null
        : bloco.marcador.numero,
      box: caixaNormalizada(esquerda - folga, topo, direita + folga, base, pagina),
      razao: chegaAoFimDaMancha
        ? "sobra-final"
        : solucoes.length > 0
          ? "enunciado-ate-solucao"
          : "enunciado-ate-proximo",
      continuaNaProxima,
    });
  }

  return estimadas;
}

/** Uma linha reconstruída a partir das palavras soltas. */
interface Linha {
  readonly topo: number;
  readonly base: number;
  readonly esquerda: number;
  readonly direita: number;
  readonly altura: number;
  /** Já em NFC — ver `agruparEmLinhas`. */
  readonly texto: string;
}

/**
 * Junta as palavras em linhas por proximidade vertical.
 *
 * O texto de cada linha sai **normalizado em NFC**, e essa é a linha mais importante do arquivo:
 * o PDF gerado por LaTeX entrega acento decomposto (o `ç` como `c` + cedilha), e uma regex escrita
 * com `ç` no editor simplesmente não casa. Falha em silêncio — nenhuma exceção, nenhum marcador,
 * nenhuma proposta —, e é um bug que este projeto já pagou uma vez.
 */
function agruparEmLinhas(palavras: readonly PalavraNaPagina[]): readonly Linha[] {
  const ordenadas = [...palavras].sort((a, b) => a.y - b.y || a.x - b.x);
  const grupos: PalavraNaPagina[][] = [];

  for (const palavra of ordenadas) {
    const grupo = grupos[grupos.length - 1];
    const referencia = grupo?.[0];

    if (grupo && referencia && palavra.y - referencia.y <= referencia.altura * TOLERANCIA_DE_LINHA) {
      grupo.push(palavra);
      continue;
    }

    grupos.push([palavra]);
  }

  return grupos.map((grupo) => {
    const emOrdem = [...grupo].sort((a, b) => a.x - b.x);

    return {
      topo: Math.min(...grupo.map((p) => p.y)),
      base: Math.max(...grupo.map((p) => p.y + p.altura)),
      esquerda: Math.min(...grupo.map((p) => p.x)),
      direita: Math.max(...grupo.map((p) => p.x + p.largura)),
      altura: mediana(grupo.map((p) => p.altura)),
      texto: emOrdem
        .map((p) => p.texto.normalize("NFC").trim())
        .filter((texto) => texto !== "")
        .join(" "),
    };
  });
}

interface MarcadorDeEnunciado {
  readonly indice: number;
  readonly numero: number;
}

/**
 * Onde cada questão começa.
 *
 * Duas condições, e a segunda é a que faz o trabalho: o marcador tem de estar **na margem
 * esquerda da coluna**. É ela que separa `1. A área do triângulo` de `5 · 12`, o numerador
 * centrado da fração logo abaixo — os dois começam com algarismo, e só um está onde um enunciado
 * começa.
 */
function marcadoresDeEnunciado(
  linhas: readonly Linha[],
  alturaTipica: number,
): readonly MarcadorDeEnunciado[] {
  if (linhas.length === 0) return [];

  const margem = Math.min(...linhas.map((linha) => linha.esquerda));
  const tolerancia = alturaTipica * TOLERANCIA_DA_MARGEM;
  const marcadores: MarcadorDeEnunciado[] = [];

  for (const [indice, linha] of linhas.entries()) {
    if (linha.esquerda > margem + tolerancia) continue;

    const achado = ENUNCIADO_NUMERADO.exec(linha.texto) ?? ENUNCIADO_ESCRITO.exec(linha.texto);
    const numero = Number.parseInt(achado?.[1] ?? "", 10);
    if (!Number.isInteger(numero)) continue;

    marcadores.push({ indice, numero });
  }

  return marcadores;
}

/** O número da questão que esta linha abre como solução, se abrir alguma. */
function numeroDaSolucao(linha: Linha): number | null {
  const achado = SOLUCAO_DA_QUESTAO.exec(linha.texto);
  const numero = Number.parseInt(achado?.[1] ?? "", 10);

  return Number.isInteger(numero) ? numero : null;
}

/**
 * A maior sequência **crescente** de números, na ordem em que aparecem na página.
 *
 * É o que sobra de defesa quando a margem falha: uma solução que enumera casos como `3. se x < 0`
 * está na margem e tem a cara de enunciado. O que ela não consegue é respeitar a numeração da
 * prova — questão nenhuma volta atrás. Mesma ideia da `maiorSequencia` de `separar-alternativas`,
 * e pela mesma razão: sequência é o que distingue estrutura de coincidência.
 */
function maiorSequenciaCrescente(
  marcadores: readonly MarcadorDeEnunciado[],
): readonly MarcadorDeEnunciado[] {
  const ateAqui: MarcadorDeEnunciado[][] = [];
  let melhor: MarcadorDeEnunciado[] = [];

  for (const [indice, marcador] of marcadores.entries()) {
    let anterior: MarcadorDeEnunciado[] = [];

    for (const candidata of ateAqui.slice(0, indice)) {
      const ultimo = candidata[candidata.length - 1];
      if (!ultimo || ultimo.numero >= marcador.numero) continue;
      if (candidata.length > anterior.length) anterior = candidata;
    }

    const atual = [...anterior, marcador];
    ateAqui.push(atual);
    if (atual.length > melhor.length) melhor = atual;
  }

  return melhor;
}

/**
 * O corpo da página, sem o número solto do rodapé.
 *
 * A página 2 da prova termina com um `2` a quarenta pontos da última linha. Dentro do recorte ele
 * viraria um algarismo perdido no fim da solução, que alguém teria de apagar depois de reconhecer.
 * São dois sinais, e os dois são exigidos: o vão maior que uma entrelinha (é o que faz um rodapé
 * ser rodapé) e a posição abaixo da mancha de texto.
 */
function semRodape(
  linhas: readonly Linha[],
  limiteDoCorpo: number,
  entrelinha: number,
): readonly Linha[] {
  let corpo = linhas;

  for (;;) {
    const ultima = corpo[corpo.length - 1];
    const anterior = corpo[corpo.length - 2];
    if (!ultima || !anterior) return corpo;

    const foraDaMancha = ultima.topo > limiteDoCorpo;
    const separada = ultima.topo - anterior.topo > entrelinha * VAO_DE_RODAPE;
    if (!foraDaMancha || !separada) return corpo;

    corpo = corpo.slice(0, -1);
  }
}

/** O espaçamento típico entre linhas. Sem duas linhas para medir, a altura da fonte responde. */
function entrelinhaDe(linhas: readonly Linha[], alturaTipica: number): number {
  const vaos = linhas
    .slice(1)
    .map((linha, ordem) => linha.topo - (linhas[ordem]?.topo ?? linha.topo))
    .filter((vao) => vao > 0);

  return vaos.length > 0 ? mediana(vaos) : alturaTipica * 2;
}

/**
 * A caixa em 0..1, presa à página.
 *
 * O recorte é guardado normalizado (D28): em pixels ele só significaria alguma coisa junto do DPI
 * em que foi medido. Prender à borda em vez de recusar, aqui, é o certo — quem desenhou foi a
 * aritmética, não a pessoa, e uma folga que vaza dois pontos na margem não é erro de ninguém.
 */
function caixaNormalizada(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  pagina: PaginaDeTexto,
): QuestaoEstimada["box"] {
  const esquerda = Math.max(0, Math.min(x0, pagina.largura));
  const topo = Math.max(0, Math.min(y0, pagina.altura));
  const direita = Math.max(esquerda, Math.min(x1, pagina.largura));
  const base = Math.max(topo, Math.min(y1, pagina.altura));

  const x = arredondar(esquerda / pagina.largura);
  const y = arredondar(topo / pagina.altura);

  return {
    x,
    y,
    width: Math.min(arredondar((direita - esquerda) / pagina.largura), arredondar(1 - x)),
    height: Math.min(arredondar((base - topo) / pagina.altura), arredondar(1 - y)),
  };
}

/** Seis casas, as mesmas de `normalizeAnchor`: é lá que esta caixa vai parar. */
const PRECISAO = 1e6;
const arredondar = (valor: number): number => Math.round(valor * PRECISAO) / PRECISAO;

function mediana(valores: readonly number[]): number {
  const ordenados = [...valores].sort((a, b) => a - b);

  return ordenados[ordenados.length >> 1] ?? 0;
}
