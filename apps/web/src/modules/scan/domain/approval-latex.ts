import { escapeLatexText } from "@modules/recognition/domain/latex-escape";

import type { ScanItem } from "./scan-item";

/**
 * O LaTeX que um item leva para o acervo (ADR 0002).
 *
 * O que vale, em ordem: o LaTeX que a pessoa revisou; o que o reconhecimento matemático devolveu;
 * e, só na falta dos dois, o texto da camada do PDF, escapado. O texto cru passa por um mínimo de
 * limpeza — hifenização de fim de linha, o rótulo que já vai em `originalLabel` —, nunca por
 * reescrita.
 */

const EXERCISE_LABEL = /^\s*(?:(?:exerc[ií]cio|problema|exercise|problem)\s+\d+(?:\.\d+)*\s*[.:)]?|\d{1,3}\s*[.)])\s*/i;
const QUESTION_HEADER = /^\s*QUEST[AÃ]O\s+\d{1,3}\s*$/i;
const ITEM_LABEL = /^\s*\(?([a-z]|[ivx]{1,5})\)\s*/i;
/**
 * A letra da alternativa — maiúscula ou minúscula.
 *
 * O ENEM imprime "A", o Iezzi imprime "a)". Aceitar as duas é seguro porque este extrator só roda
 * quando o tipo da questão pede alternativas, e quem decide o tipo é a zona (ADR 0009): no corpo
 * do livro, onde "a)" é item de exercício discursivo, ele nem é chamado.
 */
const ALTERNATIVE = /^\s*([A-Ea-e])(?:\t|\)|\.|\s|$)\s*(.*)$/;

/**
 * Uma letra de alternativa **em qualquer ponto** do texto — "b) 410" no meio da linha.
 *
 * Exige espaço (ou o começo) antes da letra: "(b)" e "f(x)" não são alternativa, e é o espaço
 * que as separa de "a) 60 b) 410", em que as cinco vêm na mesma linha. O espaço é conferido e não
 * consumido: com a matemática apagada (`outsideMath`), "a) $0$ b)" vira "a)     b)", e consumir os
 * brancos depois de "a)" tirava do "b)" o espaço de que ele precisa.
 */
const INLINE_ALTERNATIVE = /(?<=^|\s)([A-Ea-e])\)/g;

/** Junta as linhas de um parágrafo, desfazendo a hifenização de fim de linha. */
export function joinLines(lines: readonly string[]): string {
  let text = "";
  for (const line of lines.map((l) => l.trim()).filter((l) => l !== "")) {
    if (text.endsWith("-") && /^\p{Ll}/u.test(line)) text = text.slice(0, -1) + line;
    else text = text === "" ? line : `${text} ${line}`;
  }
  return text;
}

const reviewedOrRecognized = (item: ScanItem): string | null =>
  item.reviewedLatex ?? item.mathResult?.latex ?? null;

const textOf = (item: ScanItem): string => item.reviewedText ?? item.text;

/** Onde o rótulo do livro acaba e o texto começa: "Exemplo 3.", "Exemplo 2.4:", "Exemplo 7)". */
const LABEL_PREFIX = /^\s*\S+\s+\d+(?:\.\d+)*\s*[.:)]?\s*/;

/** Teoria e nota: um parágrafo. */
export function contentLatex(item: ScanItem): string {
  const ready = reviewedOrRecognized(item);
  if (ready !== null) return ready.trim();
  return escapeLatexText(joinLines(textOf(item).split("\n")));
}

/**
 * O corpo do exemplo (D56): o texto **sem** o rótulo.
 *
 * Antes o rótulo entrava em negrito no meio do corpo da seção, porque era a única marca de que
 * ali começava um exemplo. Agora o rótulo é do nó, e repeti-lo no corpo diria a mesma coisa duas
 * vezes — na árvore e na primeira linha do texto.
 */
export function exampleBody(item: ScanItem): string {
  const ready = reviewedOrRecognized(item);
  if (ready !== null) return ready.trim();

  const lines = textOf(item).split("\n");
  const first = stripLabel(lines[0] ?? "", item);
  return escapeLatexText(joinLines([first, ...lines.slice(1)]));
}

/**
 * Tira o rótulo do começo do texto — e **só** quando o rótulo existe.
 *
 * O padrão `palavra número` casa texto comum: "Sejam 2 e 3 os valores…" perderia as duas
 * primeiras palavras, no corpo e no título, sem ninguém notar. Quem autoriza o corte é o rótulo
 * que o perfil leu ("Exemplo 3"), não o formato da frase.
 */
function stripLabel(text: string, item: ScanItem): string {
  if (item.originalLabel === null) return text;
  const stripped = text.replace(LABEL_PREFIX, "");
  return stripped === text || stripped.trim() === "" ? text : stripped;
}

/**
 * A figura no LaTeX (D58, ADR 0005): `figure` com `[H]`, na posição em que o livro a tem.
 *
 * `[H]` e não `[htbp]` porque a figura do livro **pertence ao parágrafo** que a explica; deixá-la
 * flutuar para o alto da página desfaria justamente o que a importação preserva. A largura é a
 * fração que a figura ocupa na coluna do livro, medida na varredura.
 *
 * Sem arquivo — o recorte falhou, ou a varredura correu sem recortar — sai um aviso em vez de um
 * `\includegraphics` quebrado: um LaTeX que não compila é pior que uma figura que falta.
 */
export function figureLatex(item: ScanItem): string {
  const name = item.metadata["figureLatexName"];
  const caption = (item.reviewedText ?? item.title ?? "").trim();
  const captionLine = caption === "" ? "" : `  \\caption{${escapeLatexText(caption)}}\n`;

  if (typeof name !== "string" || name === "") {
    return `% figura da página ${item.pageNumber} sem arquivo — recorte não gravado${caption === "" ? "" : `: ${caption}`}`;
  }

  const fraction = Number(item.metadata["widthFraction"]);
  const width = Number.isFinite(fraction) && fraction > 0 ? Math.min(1, Math.max(0.15, fraction)) : 0.6;

  return [
    "\\begin{figure}[H]",
    "  \\centering",
    `  \\includegraphics[width=${width.toFixed(2)}\\textwidth]{${name}}`,
    captionLine.trimEnd(),
    "\\end{figure}",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/** Quanto do exemplo cabe numa linha da árvore sem empurrar o resto para fora. */
const TITLE_LENGTH = 60;

/**
 * O título do exemplo: o começo do próprio texto, sem o rótulo.
 *
 * "Exemplo 3" sozinho não diz qual dos 107 é. O começo do enunciado diz, e é o mesmo critério
 * que a árvore já usa para uma questão sem apelido.
 */
export function exampleTitle(item: ScanItem): string | null {
  const plain = stripLabel(textOf(item).replace(/\s+/g, " "), item).trim();
  if (plain === "") return null;
  return plain.length > TITLE_LENGTH ? `${plain.slice(0, TITLE_LENGTH - 1).trimEnd()}…` : plain;
}

export interface QuestionLatex {
  readonly statementLatex: string;
  readonly options: readonly string[];
  /**
   * A resolução impressa no livro, quando o exercício vem com ela — vai para
   * `Question.solutionLatex`, que existe no acervo desde sempre e o scan nunca preenchia.
   *
   * O *Fundamentos* traz 82 exercícios resolvidos: enunciado, a palavra **Solução** em negrito, e
   * a conta. Sem separar, a resposta ia junto no enunciado e a questão entregava o gabarito a
   * quem fosse respondê-la.
   */
  readonly solutionLatex: string;
  /** O que o scan leu, antes de qualquer revisão — vai para `Question.originalLatex`. */
  readonly originalLatex: string;
}

/**
 * A linha que anuncia a resolução: a palavra sozinha, não a palavra no meio de uma frase.
 *
 * "Solução" isolada numa linha é marcação editorial; "a solução da equação é" é enunciado. Exigir
 * a linha inteira é o que separa as duas sem precisar de tipografia.
 */
const SOLUTION_MARKER = /^\s*(?:solu[çc][ãa]o|resolu[çc][ãa]o|solution)\s*:?\s*$/i;

/**
 * Exercício ou questão: o enunciado, com os itens como `enumerate` de rótulo explícito
 * (`\item[a)]`, que compila sem pacote nenhum), e as alternativas separadas quando o tipo pede.
 */
export function questionLatex(
  item: ScanItem,
  children: readonly ScanItem[],
  wantsOptions: boolean,
): QuestionLatex {
  const originalLatex = item.proposed.latex ?? escapeLatexText(item.proposed.text);
  /** Corta a resolução do texto: o que vem depois do marcador não é enunciado nem alternativa. */
  const splitSolution = (source: readonly string[]): { readonly statement: string[]; readonly solution: string[] } => {
    const at = source.findIndex((line) => SOLUTION_MARKER.test(line));
    return at < 0 ? { statement: [...source], solution: [] } : { statement: source.slice(0, at), solution: source.slice(at + 1) };
  };

  // Os itens estão dentro do texto do exercício (a região dele os contém).
  const items = children.filter((child) => child.kind === "ITEM" && child.reviewState !== "REJECTED");

  /*
    O texto revisado ou reconhecido também é cortado.

    Antes ele voltava inteiro, com a resolução dentro do enunciado — e é justamente neste livro que
    isso morde: a camada de texto perde os símbolos matemáticos, então quase todo exercício passa
    pelo reconhecimento de visão e cai neste ramo.

    E as alternativas também saem dele (#245). O ramo parava aqui com `options: []`: com modelo de
    visão, a questão de vestibular do Fundamentos era rebaixada a discursiva com as alternativas
    coladas no enunciado, e a do ENEM nascia de múltipla escolha com cinco alternativas vazias.

    As linhas se juntam com quebra, e não com `joinLines`: aquilo desfaz a hifenização do texto
    cru do PDF, e em LaTeX um `%` passaria a comentar o resto da questão e o `-` de fim de linha
    (um sinal de menos) sumiria.
  */
  const ready = reviewedOrRecognized(item);
  if (ready !== null) {
    const cortado = splitSolution(withoutOwnNumber(ready, item).split("\n"));
    let statement = cortado.statement;
    let options: string[] = [];

    /*
      O LaTeX pronto manda nas alternativas quando as traz. Os ITEMs vêm da camada de texto do
      PDF, que perde a matemática — o motivo de a questão ter passado pela visão: na aprovação do
      Fundamentos, o ITEM da questão 40 dizia "a) 28  9." onde o LaTeX reconhecido dizia
      "$2^8 - 9$". Eles só entram quando o LaTeX não trouxe alternativa nenhuma.
    */
    if (wantsOptions) {
      const inLatex = alternativesInLatex(statement);
      const fromItems = inLatex === null ? alternativesFromItems(items) : null;
      if (inLatex !== null) {
        options = inLatex.options;
        statement = inLatex.statement;
      } else if (fromItems !== null) {
        options = fromItems;
        statement = beforeFirstAlternative(statement);
      }
    }

    return {
      statementLatex: statement.join("\n").trim(),
      options,
      solutionLatex: cortado.solution.join("\n").trim(),
      originalLatex,
    };
  }

  const cortado = splitSolution(
    textOf(item)
      .split("\n")
      .filter((line) => !QUESTION_HEADER.test(line)),
  );
  let lines = cortado.statement;
  const solutionLatex = cortado.solution.length === 0 ? "" : escapeLatexText(joinLines(cortado.solution));
  if (lines[0]) lines[0] = lines[0].replace(EXERCISE_LABEL, "");

  // O enunciado é o que vem antes do primeiro item, e cada item vira um `\item`.
  const firstItemText = items[0]?.text.split("\n")[0];
  if (firstItemText) {
    const cut = lines.findIndex((line) => line.trim() === firstItemText.trim());
    if (cut >= 0) lines = lines.slice(0, cut);
  }

  /*
    Numa questão de múltipla escolha, `a) b) c)` são **alternativas**, não subitens.

    O motor os reconhece como `ITEM` porque na página são a mesma coisa: letra, parêntese, recuo.
    Quem os separa é o tipo da questão — e o tipo, no Fundamentos, vem da zona. Sem esta parte, as
    359 questões de vestibular do volume nasciam `MULTIPLE_CHOICE` com zero alternativas, e o que
    deviam ser opções virava um `enumerate` dentro do enunciado: uma questão de alternativas que
    não tem alternativa nenhuma para marcar.
  */
  const fromItems = wantsOptions ? alternativesFromItems(items) : null;
  const asAlternatives = fromItems !== null;

  let options: string[] = [];
  if (fromItems !== null) {
    options = fromItems;
  } else if (wantsOptions) {
    const byLine = alternativesByLine(lines);
    if (byLine !== null) {
      options = byLine.parts.map((option) => escapeLatexText(joinLines(option)));
      lines = lines.slice(0, byLine.start);
    }
  }

  let statement = escapeLatexText(joinLines(lines));
  if (items.length > 0 && !asAlternatives) {
    const entries = items.map((child) => {
      const label = child.originalLabel ?? `${child.number ?? ""})`;
      const ready = reviewedOrRecognized(child);
      const body = ready ?? escapeLatexText(joinLines(textOf(child).split("\n")).replace(ITEM_LABEL, ""));
      return `  \\item[${label}] ${body.trim()}`;
    });
    statement = `${statement}\n\\begin{enumerate}\n${entries.join("\n")}\n\\end{enumerate}`;
  }

  return { statementLatex: statement.trim(), options, solutionLatex: solutionLatex.trim(), originalLatex };
}

/*
  As alternativas, com as três formas em que o livro as imprime.

  - **Uma por linha**, cada uma um `ITEM`: o caso simples.
  - **Em duas colunas**, e a ordem de leitura sai intercalada: `a) c) e)` de uma coluna e `b) d)`
    da outra chegam como A,C,E,B,D. A ordem que vale é a da **letra**, não a da leitura — exigir
    a de leitura rejeitava 157 das 359 questões do volume, com as cinco alternativas presentes.
  - **Todas numa linha só** — "a) Ari; água b) Bruna; água c) Carlos; suco…" —, que o motor lê
    como **um** item. Por isso o texto de cada item é recortado pelas letras que ele contém.

  E fica o **primeiro** jogo completo. Quando o limite entre duas questões falha, as alternativas
  da seguinte grudam nesta, e as letras recomeçam: a–e, a–e de novo. O primeiro jogo, na ordem
  de leitura, é o desta questão.

  `null` quando os itens não formam um jogo completo (A, B, … sem buraco, pelo menos duas).
*/
function alternativesFromItems(items: readonly ScanItem[]): string[] | null {
  const firstRun: { readonly letter: string; readonly latex: string }[] = [];
  const seen = new Set<string>();
  collect: for (const child of items) {
    const ready = reviewedOrRecognized(child);
    const text = ready ?? joinLines(textOf(child).split("\n"));
    const marks = [...text.matchAll(INLINE_ALTERNATIVE)];
    for (const [index, mark] of marks.entries()) {
      const letter = (mark[1] ?? "").toUpperCase();
      if (seen.has(letter)) break collect;
      seen.add(letter);
      const start = (mark.index ?? 0) + mark[0].length;
      const end = marks[index + 1]?.index ?? text.length;
      const piece = text.slice(start, end).trim();
      firstRun.push({ letter, latex: ready === null ? escapeLatexText(piece) : piece });
    }
  }
  const complete =
    firstRun.length >= 2 &&
    [...firstRun.map((option) => option.letter)]
      .sort()
      .every((letter, index) => letter === letterAt(index));
  if (!complete) return null;
  return [...firstRun]
    .sort((a, b) => a.letter.localeCompare(b.letter))
    .map((option) => option.latex);
}

/**
 * O enunciado sem as alternativas: tudo antes do "a)" — no começo de uma linha ou no meio dela.
 *
 * Só é chamado quando as alternativas já foram achadas: sem elas, cortar no primeiro "a)" poderia
 * tirar do enunciado um subitem de uma questão discursiva.
 */
function beforeFirstAlternative(lines: readonly string[]): string[] {
  const masked = outsideMath(lines.join("\n")).split("\n");
  for (const [index, line] of lines.entries()) {
    const mark = [...(masked[index] ?? "").matchAll(INLINE_ALTERNATIVE)].find(
      (match) => match[1]?.toUpperCase() === "A",
    );
    if (mark === undefined) continue;
    const head = line.slice(0, mark.index ?? 0).trimEnd();
    return [...lines.slice(0, index), ...(head === "" ? [] : [head])];
  }
  return [...lines];
}

/**
 * As alternativas escritas no próprio LaTeX, quando não há `ITEM` que as traga — o reconhecimento
 * de visão devolve a questão inteira, alternativas inclusive.
 *
 * Primeiro as marcas `a) b) c)`, em sequência a partir do `a`, numa linha só ou uma por linha; se
 * não houver, a forma do ENEM, uma letra no começo de cada linha. O texto já é LaTeX: nada aqui é
 * escapado. `null` quando não há um jogo em sequência com pelo menos duas.
 */
function alternativesInLatex(
  lines: readonly string[],
): { readonly statement: string[]; readonly options: string[] } | null {
  const text = lines.join("\n");
  const marks = [...outsideMath(text).matchAll(INLINE_ALTERNATIVE)];
  const first = marks.findIndex((mark) => mark[1]?.toUpperCase() === "A");
  if (first >= 0) {
    const run: RegExpExecArray[] = [];
    for (const mark of marks.slice(first)) {
      if (mark[1]?.toUpperCase() !== letterAt(run.length)) break;
      run.push(mark);
    }
    if (run.length >= 2) {
      const options = run.map((mark, index) =>
        text.slice((mark.index ?? 0) + mark[0].length, run[index + 1]?.index ?? text.length).trim(),
      );
      return {
        statement: text
          .slice(0, run[0]?.index ?? 0)
          .trimEnd()
          .split("\n"),
        options,
      };
    }
  }

  const byLine = alternativesByLine(lines);
  if (byLine === null) return null;
  return {
    statement: lines.slice(0, byLine.start),
    options: byLine.parts.map((option) => option.join("\n").trim()),
  };
}

/**
 * As alternativas uma por linha, na forma do ENEM ("A texto"): a partir da linha do A, cada letra
 * seguinte abre uma alternativa, e o que não abre continua a anterior. Serve ao texto cru e ao
 * LaTeX; quem chama decide como juntar e se escapa. `null` sem ao menos duas.
 */
function alternativesByLine(
  lines: readonly string[],
): { readonly start: number; readonly parts: string[][] } | null {
  const start = lines.findIndex((line) => ALTERNATIVE.exec(line)?.[1]?.toUpperCase() === "A");
  if (start < 0) return null;
  const parts: string[][] = [];
  for (const line of lines.slice(start)) {
    const match = ALTERNATIVE.exec(line);
    // A sequência é conferida em maiúscula: o livro escolhe a caixa, a ordem A→E é a mesma.
    if (match && match[1]?.toUpperCase() === letterAt(parts.length)) parts.push([match[2] ?? ""]);
    else parts[parts.length - 1]?.push(line);
  }
  return parts.length >= 2 ? { start, parts } : null;
}

/** A letra da alternativa na posição `index`, em maiúscula: 0 → "A". */
const letterAt = (index: number): string => String.fromCharCode(65 + index);

/**
 * O LaTeX sem o número da própria questão no começo — "15. (FEI-SP) …" vira "(FEI-SP) …".
 *
 * O modelo de visão transcreve a linha inteira, rótulo incluído, e o rótulo já é do nó: repeti-lo
 * no enunciado diria o número duas vezes. Só o número **dela**, seguido de ponto ou parêntese —
 * "150 alunos" não é rótulo da questão 15.
 */
function withoutOwnNumber(latex: string, item: ScanItem): string {
  if (item.number === null) return latex;
  const own = new RegExp(`^\\s*${item.number.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[.)]\\s*`);
  return latex.replace(own, "");
}

/** Os trechos de matemática do LaTeX: `$$…$$`, `$…$`, `\[…\]` e `\(…\)`. */
const MATH = /\$\$[\s\S]*?\$\$|\$(?:\\\$|[^$])*\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)/g;

/**
 * O texto com a matemática apagada — cada caractere dela vira espaço, e o tamanho não muda.
 *
 * É onde se procuram as marcas de alternativa no LaTeX: "$(B^c \cup A)^c$" tem um "A)" que não é
 * alternativa, e na questão 43 do Fundamentos ele e o "B)" de "$n(A \cap B)$" formavam um falso
 * jogo A, B. Como o tamanho é o mesmo, os índices achados aqui valem no texto original.
 */
function outsideMath(latex: string): string {
  return latex.replace(MATH, (math) => math.replace(/[^\n]/g, " "));
}
