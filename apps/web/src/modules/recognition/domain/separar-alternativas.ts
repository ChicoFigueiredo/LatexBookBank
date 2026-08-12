/**
 * Separa o enunciado das alternativas num recorte de questão inteira.
 *
 * O handoff do protótipo lista isto como lacuna, com estas palavras: *"Reconhecimento tinha 3
 * modos técnicos (display/mixed/text); faltava **Questão completa**"*. E a lacuna era mais funda do
 * que a frase sugere: `RecognitionCandidate` já tem `statementLatex` **e** `options`, e
 * `createQuestionFromRecognition` já sabe gravar as duas coisas — **nada no app jamais preencheu
 * `options`**. A ponta receptora estava pronta e ninguém alimentava.
 *
 * O que falta entre "o modelo leu a página" e "a questão existe com cinco alternativas" não é
 * modelo: é esta separação, que é um problema de texto e se resolve com regra explícita e testada,
 * em vez de um prompt que às vezes obedece.
 *
 * **Nada aqui decide gabarito.** O modelo não sabe qual é a correta, e adivinhar seria pior que
 * não marcar: uma alternativa marcada errada passa por revisada. Quem marca é a pessoa, no editor.
 */

export interface AlternativaLida {
  /** O rótulo como estava no livro — "a", "B", "III". Insubstituível: é como se cita a questão. */
  readonly label: string;
  readonly statementLatex: string;
}

export interface QuestaoSeparada {
  readonly statementLatex: string;
  readonly options: readonly AlternativaLida[];
}

/**
 * Os formatos de rótulo que o acervo tem de verdade.
 *
 * Cinco formas, e não uma regex genérica de "letra seguida de pontuação": o enunciado de
 * matemática está cheio de `f(x)`, `a)` dentro de uma conta e `(b)` como parte de uma expressão.
 * A âncora é o **início da linha**, e é ela que separa rótulo de fórmula — um `a)` no meio de
 * `seja a) o coeficiente` não abre alternativa nenhuma, e é assim que tem de ser.
 */
const ROTULO = /^\s*(?:\(\s*([a-eA-E])\s*\)|([a-eA-E])\s*[).\-–]|\(\s*([ivxIVX]{1,4})\s*\)|([ivxIVX]{1,4})\s*\))\s+/;

/** Quantas alternativas uma questão de múltipla escolha tem, no acervo real. */
const MINIMO = 2;

/**
 * Lê o recorte inteiro e devolve o que dá para afirmar.
 *
 * Devolve `options` vazio quando não encontra uma sequência confiável — e isso é uma resposta, não
 * uma falha. Recorte de questão discursiva, de fórmula solta ou de página com duas questões cai
 * aqui, e o certo é entregar o texto inteiro como enunciado para a pessoa decidir. Inventar uma
 * alternativa a partir de uma linha que começa com "e)" num parágrafo de prosa seria pior que não
 * separar nada.
 */
export function separarAlternativas(latex: string): QuestaoSeparada {
  const linhas = latex.split(/\r?\n/);

  const marcadas: { indice: number; label: string; resto: string }[] = [];
  for (const [indice, linha] of linhas.entries()) {
    const achado = ROTULO.exec(linha);
    if (!achado) continue;

    const label = achado[1] ?? achado[2] ?? achado[3] ?? achado[4] ?? "";
    marcadas.push({ indice, label, resto: linha.slice(achado[0].length) });
  }

  const sequencia = maiorSequencia(marcadas);
  if (sequencia.length < MINIMO) return { statementLatex: latex.trim(), options: [] };

  const primeira = sequencia[0];
  if (!primeira) return { statementLatex: latex.trim(), options: [] };

  const statementLatex = linhas.slice(0, primeira.indice).join("\n").trim();
  // Enunciado vazio significa que o recorte começa **na** primeira alternativa: a pessoa recortou
  // só o bloco de opções. Separar aqui deixaria uma questão sem pergunta, e é melhor devolver o
  // texto inteiro e deixá-la recortar de novo.
  if (statementLatex === "") return { statementLatex: latex.trim(), options: [] };

  const options = sequencia.map((marca, ordem) => {
    const fim = sequencia[ordem + 1]?.indice ?? linhas.length;
    const continuacao = linhas.slice(marca.indice + 1, fim).join("\n").trim();

    return {
      label: marca.label,
      // A alternativa continua nas linhas seguintes até a próxima começar: no acervo real elas
      // quebram em duas ou três linhas quando têm fração, e cortar na primeira perderia metade.
      statementLatex: [marca.resto.trim(), continuacao].filter((parte) => parte !== "").join("\n"),
    };
  });

  return { statementLatex, options };
}

/**
 * A maior sequência **consecutiva** de rótulos, na ordem do alfabeto ou dos romanos.
 *
 * É o que separa um bloco de alternativas de linhas que por acaso começam com letra e parêntese.
 * Uma questão tem `a) b) c) d) e)` em ordem; um texto com `a) ... c) ...` fora de ordem, ou com um
 * `b)` sozinho, não é bloco de alternativas — e tratar como se fosse criaria uma questão com duas
 * alternativas inventadas a partir de prosa.
 */
function maiorSequencia(
  marcadas: readonly { indice: number; label: string; resto: string }[],
): readonly { indice: number; label: string; resto: string }[] {
  let melhor: typeof marcadas = [];
  let atual: typeof marcadas = [];

  for (const marca of marcadas) {
    const anterior = atual[atual.length - 1];

    atual = anterior && sucede(anterior.label, marca.label) ? [...atual, marca] : [marca];
    if (atual.length > melhor.length) melhor = atual;
  }

  return melhor;
}

const ROMANOS = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"];

/** `b` sucede `a`; `ii` sucede `i`. Caixa não importa — o livro alterna, e o rótulo é preservado. */
function sucede(anterior: string, proximo: string): boolean {
  const a = anterior.toLowerCase();
  const b = proximo.toLowerCase();

  const romanoA = ROMANOS.indexOf(a);
  if (romanoA >= 0) return ROMANOS[romanoA + 1] === b;

  // Letras: só as latinas de uma posição. `a`→`b`, `d`→`e`.
  if (a.length !== 1 || b.length !== 1) return false;

  return b.charCodeAt(0) - a.charCodeAt(0) === 1;
}

/**
 * Duas alternativas coladas num bloco só — o caso `ocrMerged` do protótipo (1702–1712).
 *
 * O separador ancora no **início da linha**, e é assim que tem de ser: `seja a) o coeficiente` no
 * meio de um enunciado não abre alternativa nenhuma. Mas o OCR de uma página de duas colunas cola
 * `b) R$ 6.341,21 c) R$ 6.529,67` na mesma linha com frequência — e aí a regra que protege o
 * enunciado produz uma alternativa com duas dentro.
 *
 * A resposta do protótipo não é dividir sozinho: é **sinalizar e oferecer o gesto**. E está certa,
 * pela mesma razão que o separador recusa mais do que aceita — dividir por conta própria criaria
 * uma alternativa a partir de um `c)` que talvez seja parte do texto. Perguntar custa um clique;
 * errar custa uma prova impressa com a alternativa errada.
 *
 * O que se procura é preciso, e não "qualquer rótulo dentro": é **o rótulo que deveria vir a
 * seguir**. `b)` contendo `c)` é bloco unido; `b)` contendo `a)` é citação, e fica quieto.
 */
export interface BlocoUnido {
  /** Índice da alternativa que carrega as duas. */
  readonly indice: number;
  /** As duas, já separadas — o que o botão "Dividir em duas" grava. */
  readonly partes: readonly AlternativaLida[];
}

export function detectarBlocoUnido(
  options: readonly AlternativaLida[],
): readonly BlocoUnido[] {
  const unidos: BlocoUnido[] = [];

  for (const [indice, opcao] of options.entries()) {
    const esperado = proximoRotulo(opcao.label);
    if (esperado === null) continue;

    // Já existe como alternativa própria? Então não há bloco unido — o `c)` de dentro é outra
    // coisa, e dividir criaria uma alternativa duplicada.
    if (options.some((outra) => outra.label.toLowerCase() === esperado)) continue;

    const corte = new RegExp(`(?:^|\\s)\\(?(${esperado})\\)?\\s*[).\\-–]?\\s+`, "i").exec(
      opcao.statementLatex,
    );
    if (!corte || corte.index === 0) continue;

    const antes = opcao.statementLatex.slice(0, corte.index).trim();
    const depois = opcao.statementLatex.slice(corte.index + corte[0].length).trim();
    if (antes === "" || depois === "") continue;

    unidos.push({
      indice,
      partes: [
        { label: opcao.label, statementLatex: antes },
        // O rótulo sai do texto **como estava escrito**, e não normalizado: é o rótulo do livro.
        { label: corte[1] ?? esperado, statementLatex: depois },
      ],
    });
  }

  return unidos;
}

/** `b` → `c`; `ii` → `iii`. `null` quando não há próximo previsível. */
function proximoRotulo(label: string): string | null {
  const atual = label.toLowerCase();

  const romano = ROMANOS.indexOf(atual);
  if (romano >= 0) return ROMANOS[romano + 1] ?? null;

  if (atual.length !== 1 || atual < "a" || atual > "y") return null;

  return String.fromCharCode(atual.charCodeAt(0) + 1);
}
