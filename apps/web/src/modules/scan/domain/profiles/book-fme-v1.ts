import type { AnchorMatch, CaptureProfile, DocumentZone, WalkContext } from "../capture-profile";
import type { PageModel, TextLine } from "../page";
import type { ScanKind } from "../proposal";
import { stripAccents } from "../text";
import { measureStyle, relativeSize, type PublicationStyle } from "../typography";
import { semanticPrompt } from "./semantic-prompt";

/**
 * `book-fme-v1` — a coleção *Fundamentos de Matemática Elementar* (Iezzi e outros), onze volumes.
 *
 * Nasceu porque o `book-v1` não lê este livro: no vol. 1 ele achava 0 exemplos, 0 exercícios e
 * 453 falsas seções em 420 páginas. Três causas, e só uma era defeito do motor (corrigida à
 * parte, no aprendizado de estilo). As outras duas são deste livro, e são o porquê deste arquivo:
 *
 * - **O bloco de exercícios vem com as letras separadas**: `E X E R C Í C I O S`, 62 vezes no
 *   volume, e nenhuma ocorrência da palavra contígua. Como o bloco nunca abria, o ramo que
 *   reconhece `135.` como exercício nunca era alcançado — os 568 exercícios estavam lá, intactos.
 * - **As seções são numeradas em romano**: `IV. Conjunto universo`, 83 delas. Toda regra de
 *   título numerado do motor exige algarismo arábico.
 *
 * E o livro tem **quatro zonas** com regras diferentes, que é o que motivou o conceito de zona no
 * contrato: corpo, gabarito dos exercícios, questões de vestibular e gabarito dos vestibulares.
 *
 * A tipografia é a evidência, e é consistente na coleção inteira. Medida no vol. 1, com o corpo
 * do texto em 10 pt:
 *
 *     CAPÍTULO VI          Eurostile        28 pt   2,80×
 *     IV. Conjunto universo Rockwell-Bold   15 pt   1,50×   ← seção
 *     40. Propriedades…    Rockwell-Bold    13 pt   1,30×   ← item de teoria
 *     E X E R C Í C I O S  Eurostile-Demi   19 pt   1,90×
 *     135.                 FranklinGothic-Demi 10 pt 1,00×  ← número do exercício, só o 1º span
 *
 * O número do exercício e o número do item de teoria são **os dois** um número seguido de ponto,
 * em negrito, no começo da linha. O que os separa é o corpo do primeiro span: 1,0× contra 1,3×.
 * Por isso este perfil olha o span, e não a linha — a linha do item de teoria mede 1,0× porque o
 * parágrafo emenda logo depois do número.
 */

/** "CAPÍTULO I", e também "APÊNDICE I": o apêndice abre como capítulo, na mesma fonte e corpo. */
const CHAPTER = /^(CAPITULO|APENDICE)\s+([IVXLC]+)\b\s*(.*)$/i;
/** `IV. Conjunto universo` e `III.Conjunto unitário` — o livro às vezes come o espaço. */
const SECTION_ROMAN = /^([IVXLC]{1,7})\s*\.\s*(\S.*)$/;
/**
 * `E X E R C Í C I O S`, e as ocorrências que o extrator lê sem o S final.
 *
 * A letra acentuada aceita **qualquer** caractere. Numa das 62 ocorrências do volume — a da
 * página 117 — a fonte entrega o "Í" como "ê", e o banner chegava como "E X E R C ê C I O S". O
 * bloco não abria, e os exercícios 188 a 193 ficavam invisíveis. Nada mais num livro tem esta
 * forma — dez letras separadas, em corpo de título —, então a tolerância não custa falso positivo.
 */
const SPACED_EXERCISES = /^E\s+X\s+E\s+R\s+C\s+\S\s+C\s+I\s+O\s*S?$/i;
/** O número no primeiro span: `135.` do exercício, `68.` do item de teoria. */
const NUMBER_SPAN = /^(\d{1,3})\.$/;
const NUMBER_LINE = /^(\d{1,3})\.\s*(.*)$/;
/** `1. (UF-RS) …` — a banca entre parênteses é o que marca a questão de vestibular. */
const VESTIBULAR = /^(\d{1,3})\s*\.\s*\(([^)]{2,40})\)\s*(.*)$/;
const ITEM = /^\(?([a-z])\)\s/;
/**
 * O número e o ponto no começo da linha. Com ou sem espaço depois: no vol. 1 vinha "21. todas", e
 * do vol. 2 em diante a camada de texto cola o número no que segue ("145.a) 3", "150.6 561").
 * O "2.5" de dentro de uma resposta não abre outra — o motor descarta o número que não avança.
 */
const ANSWER_START = /^(\d{1,3})\s*\.(?!\.)/;

const SIGLAS = "siglas das bancas";
const SIGLAS_HEADER = "SIGNIFICADO DAS SIGLAS DE VESTIBULARES";
/** "UF-RJ — Universidade Federal do Rio de Janeiro": a sigla, o travessão, o nome. */
const SIGLA = /^\S[^—]{0,40}\s—\s\S/;

/** O cabeçalho corrente que anuncia cada zona, na forma em que o extrator o entrega. */
const ZONE_MARKERS: readonly { readonly header: string; readonly zone: Omit<DocumentZone, "from"> }[] = [
  // Os dois gabaritos não têm estrutura, têm respostas: cada uma vai à questão do mesmo número (D77).
  {
    header: "RESPOSTAS DAS QUESTOES DE VESTIBULARES",
    zone: { label: "respostas dos vestibulares", skip: true, answersTo: "QUESTION" },
  },
  {
    header: "RESPOSTAS DOS EXERCICIOS",
    zone: { label: "respostas dos exercícios", skip: true, answersTo: "EXERCISE" },
  },
  {
    header: "QUESTOES DE VESTIBULARES",
    zone: { label: "questões de vestibulares", questionType: "MULTIPLE_CHOICE" },
  },
  // A lista das bancas, depois do gabarito dos vestibulares: em duas colunas, ao contrário do livro.
  { header: SIGLAS_HEADER, zone: { label: SIGLAS, columns: true } },
];

/**
 * O título da lista de siglas: com "e olimpíadas" no vol. 1, sem no vol. 7. A linha inteira, e não
 * o começo: a do sumário ("… olimpíadas ..... 418") começa igual, e abria a zona na p. 8.
 */
const SIGLAS_TITLE = /^SIGNIFICADO DAS SIGLAS DE VESTIBULARES( E OLIMPIADAS)?$/;
function isSiglasHeader(header: string): boolean {
  return SIGLAS_TITLE.test(header);
}

/** O cabeçalho que a linha anuncia, se anuncia algum: igual ao da zona, ou o das siglas. */
function markerOf(header: string): (typeof ZONE_MARKERS)[number] | undefined {
  return ZONE_MARKERS.find((candidate) => candidate.header === header || (candidate.header === SIGLAS_HEADER && isSiglasHeader(header)));
}

const fold = (line: TextLine) => stripAccents(line.text).trim();

/*
  Os três marcos da coleção, cada um num lugar só.

  Eles são consultados de três pontos — a classificação, a nota do perfil e a proteção contra
  figura — e, escritos três vezes, os limiares divergiam em silêncio: o banner exigia 1,5× num
  lugar e nada no outro. Um marco, uma definição.
*/
const isBanner = (line: TextLine, style: PublicationStyle): boolean =>
  SPACED_EXERCISES.test(fold(line)) && relativeSize(line, style) >= 1.5;

const ehSecaoRomana = (line: TextLine, style: PublicationStyle): boolean =>
  line.bold && relativeSize(line, style) >= 1.4 && SECTION_ROMAN.test(line.text.trim());

const ehCapitulo = (line: TextLine, style: PublicationStyle): boolean =>
  CHAPTER.test(fold(line)) && relativeSize(line, style) >= 2;
const upper = (line: TextLine) => stripAccents(line.text).replace(/\s+/g, " ").trim().toUpperCase();

/** Título de seção sem número: negrito, em corpo de título, sem número romano nem arábico. */
const ehTituloDeSecao = (line: TextLine, style: PublicationStyle): boolean => {
  const ratio = relativeSize(line, style);
  const text = line.text.trim();
  return (
    line.bold &&
    ratio >= 1.35 &&
    ratio < 2 &&
    text.length <= 60 &&
    !/^\d/.test(text) &&
    !SECTION_ROMAN.test(text) &&
    !isBanner(line, style)
  );
};

/** "LEITURA" e "APÊNDICE" em versal no livro; na árvore, como se escreve. */
const rotulo = (text: string): string =>
  text === text.toUpperCase() ? text.charAt(0) + text.slice(1).toLowerCase() : text;

/**
 * As linhas seguintes que continuam um título: negrito, em corpo de título — e no mesmo corpo,
 * quando `size` é dado —, sem número na frente.
 */
function continuacaoDoTitulo(context: WalkContext, size: number): string[] {
  const linhas: string[] = [];
  for (let offset = 1; ; offset++) {
    const next = context.peek(offset);
    if (!next || !next.bold || /^\d/.test(next.text.trim()) || SECTION_ROMAN.test(next.text.trim())) break;
    if (size > 0 ? Math.abs(next.size - size) > 0.5 : relativeSize(next, context.style) < 1.35) break;
    if (next.pageNumber !== context.line.pageNumber) break;
    linhas.push(next.text.trim());
  }
  return linhas;
}

/**
 * O título de texto que não é capítulo numerado: "Apresentação", na fonte e no corpo do
 * "CAPÍTULO I". O livro todo em LaTeX passa por ele — o prefácio se perdia, 33 linhas da p. 5.
 * Uma palavra ou duas, sem número: o "1" de 51 pt da folha de rosto não é título.
 */
const ehTituloSemNumero = (line: TextLine, style: PublicationStyle): boolean =>
  line.bold &&
  relativeSize(line, style) >= 2.4 &&
  /^Eurostile-BoldExtended/i.test(line.fontName) &&
  !CHAPTER.test(fold(line)) &&
  /^\p{L}[\p{L} ]{2,30}$/u.test(line.text.trim());

/** O corpo do primeiro span, em múltiplos do corpo do livro. É ele que separa exercício de teoria. */
function prefixRatio(line: TextLine, style: PublicationStyle): number {
  const first = line.spans[0];
  if (!first || style.bodySize <= 0) return relativeSize(line, style);
  return first.size / style.bodySize;
}

const prefixBold = (line: TextLine): boolean => line.spans[0]?.bold ?? line.bold;

const CONTAINS: Readonly<Record<string, readonly ScanKind[]>> = {
  ROOT: ["CHAPTER", "SECTION", "EXERCISE_GROUP", "QUESTION", "FIGURE", "ANSWER"],
  // A resposta em gráfico: "21." e o desenho logo abaixo.
  ANSWER: ["FIGURE"],
  CHAPTER: ["SECTION", "SUBSECTION", "CONTENT", "EXERCISE_GROUP", "NOTE", "FIGURE"],
  SECTION: ["SUBSECTION", "CONTENT", "EXERCISE_GROUP", "NOTE", "FIGURE"],
  SUBSECTION: ["CONTENT", "EXERCISE_GROUP", "NOTE", "FIGURE"],
  // O tema da seção de vestibulares ("Lógica", "Função quadrática") agrupa questões, não exercícios.
  EXERCISE_GROUP: ["EXERCISE", "QUESTION"],
  EXERCISE: ["ITEM", "FIGURE"],
  QUESTION: ["ITEM", "FIGURE"],
};

function classify(context: WalkContext): AnchorMatch | null {
  const { line, style } = context;
  const text = fold(line);
  const ratio = relativeSize(line, style);
  const open = new Set(context.open.map((element) => element.kind));

  /*
    A seção de vestibulares tem estrutura própria, e ela espelha o livro.

    Abre com um título grande — "Questões de" / "vestibulares", no mesmo corpo do nome de capítulo
    — e divide as questões em dez temas em 13 pt, um por capítulo: "Lógica", "Conjuntos", "Função
    quadrática". Sem isto, as 359 questões caíam soltas na raiz do livro, depois do capítulo X.
  */
  if (context.zone?.questionType !== undefined && !CHAPTER.test(text)) {
    if (ratio >= 2) {
      const abaixo: string[] = [];
      for (let offset = 1; ; offset++) {
        const next = context.peek(offset);
        if (!next || relativeSize(next, style) < 2) break;
        abaixo.push(next.text.trim());
      }
      return {
        kind: "CHAPTER",
        label: [line.text.trim(), ...abaixo].join(" "),
        number: null,
        title: [line.text.trim(), ...abaixo].join(" "),
        extent: "heading",
        lines: 1 + abaixo.length,
        confidence: { pattern: 0.9, typography: 0.98 },
        evidence: ["título de abertura da zona", `corpo ${ratio.toFixed(2)}× o do livro`],
      };
    }
    // O tema: negrito, em corpo de título, sem número — é o que o separa do enunciado.
    if (line.bold && prefixRatio(line, style) >= 1.2 && !/^\d/.test(line.text.trim()) && line.text.trim().length <= 80) {
      return {
        kind: "EXERCISE_GROUP",
        label: line.text.trim(),
        number: null,
        title: line.text.trim(),
        extent: "until-boundary",
        lines: 1,
        confidence: { pattern: 0.9, typography: 0.95 },
        evidence: ["tema das questões de vestibulares", `corpo ${prefixRatio(line, style).toFixed(2)}× o do livro`],
      };
    }
  }

  /*
    A lista das bancas: o título é um capítulo sem número, e cada sigla, uma nota — um parágrafo
    no corpo dele, e não as 80 siglas emendadas numa linha só.
  */
  if (context.zone?.label === SIGLAS) {
    if (line.bold && ratio >= 1.2) {
      return {
        kind: "CHAPTER",
        label: line.text.trim(),
        number: null,
        title: line.text.trim(),
        extent: "heading",
        lines: 1,
        confidence: { pattern: 0.85, typography: 0.9 },
        evidence: ["título da lista de siglas", `corpo ${ratio.toFixed(2)}× o do livro`],
      };
    }
    if (SIGLA.test(line.text.trim())) {
      return {
        kind: "NOTE",
        label: null,
        number: null,
        title: null,
        extent: "until-boundary",
        lines: 1,
        confidence: { pattern: 0.9, layout: 0.9 },
        evidence: ["sigla, travessão e o nome da banca"],
      };
    }
    return null;
  }

  // CAPÍTULO I — o rótulo numa linha, o nome do capítulo na seguinte, em corpo ainda maior.
  const chapter = CHAPTER.exec(text);
  if (chapter && ehCapitulo(line, style)) {
    /*
      O nome do capítulo vem **abaixo** do rótulo, em corpo ainda maior, e quebrado em quantas
      linhas precisar: "Função composta" / "Função inversa". Recolher só a primeira daria
      "Função composta" numa árvore em que o capítulo se chama outra coisa.
    */
    const abaixo: string[] = [];
    for (let offset = 1; ; offset++) {
      const next = context.peek(offset);
      if (!next || relativeSize(next, style) < 2) break;
      abaixo.push(next.text.trim());
    }
    const title = abaixo.length > 0 ? abaixo.join(" ") : (chapter[3] ?? "").trim();
    // O apêndice não tem número de capítulo: "APÊNDICE I" ao lado do "CAPÍTULO I" confundiria o
    // sumário e a árvore. O rótulo do livro fica, e é por ele que a árvore o chama.
    const appendix = /^APENDICE$/i.test(chapter[1] ?? "");
    return {
      kind: "CHAPTER",
      label: line.text.trim(),
      number: appendix ? null : (chapter[2] ?? null),
      title: title || null,
      extent: "heading",
      lines: 1 + abaixo.length,
      confidence: { pattern: 0.97, typography: 0.98 },
      evidence: [appendix ? "APÊNDICE em romano" : "CAPÍTULO em romano", `corpo ${ratio.toFixed(2)}× o do livro`],
    };
  }

  if (ehTituloSemNumero(line, style)) {
    return {
      kind: "CHAPTER",
      label: line.text.trim(),
      number: null,
      title: line.text.trim(),
      extent: "heading",
      lines: 1,
      confidence: { pattern: 0.85, typography: 0.95 },
      evidence: ["título na fonte do capítulo, sem número", `corpo ${ratio.toFixed(2)}× o do livro`],
    };
  }

  // IV. Conjunto universo — a seção, em romano e 1,5× o corpo.
  const roman = SECTION_ROMAN.exec(line.text.trim());
  if (roman && ehSecaoRomana(line, style)) {
    // O título quebrado em duas linhas: "X. Informações que auxiliam a construção" / "do gráfico".
    const resto = continuacaoDoTitulo(context, line.size);
    const title = [(roman[2] ?? "").trim(), ...resto].join(" ").trim();
    return {
      kind: "SECTION",
      label: line.text.trim(),
      number: roman[1] ?? null,
      title: title || null,
      extent: "heading",
      lines: 1 + resto.length,
      confidence: { pattern: 0.95, typography: 0.98 },
      evidence: ["seção numerada em romano", `corpo ${ratio.toFixed(2)}× o do livro`],
    };
  }

  /*
    O bloco de exercícios, impresso com as letras separadas.

    É o achado que explica os 0 exercícios: `E X E R C Í C I O S` não casa com nenhuma regra que
    procure a palavra. Aqui ele é a âncora mais confiável do livro — 1,9× o corpo, em negrito, e
    sempre sozinho na linha.
  */
  if (isBanner(line, style)) {
    return {
      kind: "EXERCISE_GROUP",
      label: line.text.trim(),
      number: null,
      title: null,
      extent: "until-boundary",
      lines: 1,
      confidence: { pattern: 0.98, typography: 0.98 },
      evidence: ["banner E X E R C Í C I O S", `corpo ${ratio.toFixed(2)}× o do livro`],
    };
  }

  /*
    A seção sem número, dentro de um capítulo: "Apêndice" / "Princípio da indução finita" (p. 65)
    e as LEITURAS de história da Matemática — "LEITURA" / "Cantor e a teoria dos conjuntos".

    Sem ela, o título virava texto da seção anterior, e a LEITURA inteira — com o retrato do
    Cantor — entrava no enunciado do último exercício, que vai até a próxima fronteira. A primeira
    linha, quando o título tem duas, é o rótulo; a seguinte, o título.
  */
  if (open.has("CHAPTER") && ehTituloDeSecao(line, style)) {
    const resto = continuacaoDoTitulo(context, 0);
    const [label, ...titulo] = resto.length > 0 ? [line.text.trim(), ...resto] : [null, line.text.trim()];
    return {
      kind: "SECTION",
      label: label === null ? line.text.trim() : rotulo(label),
      number: null,
      title: titulo.join(" "),
      extent: "heading",
      lines: 1 + resto.length,
      confidence: { pattern: 0.85, typography: 0.95 },
      evidence: ["título de seção sem número, dentro do capítulo", `corpo ${ratio.toFixed(2)}× o do livro`],
    };
  }

  // 1. (UF-RS) … — a questão de vestibular, reconhecida pela banca entre parênteses.
  /*
    A questão de vestibular, e só dentro da zona que as abriga.

    A banca entre parênteses é o sinal, mas ela sozinha não basta: um exercício do corpo pode
    citar uma banca e continuar sendo exercício do livro. Quem decide é a zona — é para isso que
    ela chega até aqui.

    O `closes` impede a questão de se aninhar num exercício do corpo. Não fecha o grupo: o grupo
    agora é o tema, e é nele que a questão tem de cair. Quem fecha o último bloco de exercícios do
    corpo é o título de abertura da zona, que abre um capítulo novo na raiz.
  */
  const vestibular = VESTIBULAR.exec(line.text.trim());
  if (vestibular && context.zone?.questionType !== undefined) {
    return {
      kind: "QUESTION",
      label: `${vestibular[1]}.`,
      number: vestibular[1] ?? null,
      title: null,
      extent: "until-boundary",
      lines: 1,
      confidence: { pattern: 0.94, layout: 0.9 },
      evidence: ["número seguido da banca entre parênteses", `banca ${vestibular[2]}`],
      metadata: { banca: (vestibular[2] ?? "").trim() },
      closes: ["EXERCISE"],
    };
  }

  const numbered = NUMBER_LINE.exec(line.text.trim());
  if (!numbered || !prefixBold(line)) return null;
  const number = numbered[1] ?? "";
  const prefix = prefixRatio(line, style);

  /*
    Na zona de vestibulares, número em negrito é questão — com ou sem banca.

    A banca falta quando várias questões dividem um enunciado: "254." e "255." perguntam sobre a
    mesma lanchonete da 253, e por isso não repetem "(Enem)". Sem esta regra elas eram engolidas
    pela 253, que ficava com três jogos de alternativas; depois do agrupamento por tema, viravam
    exercício do corpo dentro de um tema de vestibular.
  */
  if (context.zone?.questionType !== undefined && prefix <= 1.1) {
    return {
      kind: "QUESTION",
      label: `${number}.`,
      number,
      title: null,
      extent: "until-boundary",
      lines: 1,
      confidence: { pattern: 0.86, layout: 0.9 },
      evidence: ["número em negrito na zona de vestibulares", "sem banca: divide o enunciado com a anterior"],
      closes: ["EXERCISE"],
    };
  }

  /*
    Aqui moram as duas sequências do livro, e elas só se distinguem pelo corpo do primeiro span.

    A página 84 tem `134.` (exercício) e `68.` (teoria) — dois números seguidos de ponto, os dois
    em negrito no começo da linha. O exercício traz o número em 10 pt, o mesmo corpo do enunciado
    que vem logo depois; o item de teoria traz o número em 13 pt, e o parágrafo emenda em 10 pt.
  */
  if (prefix >= 1.2) {
    const title = (numbered[2] ?? "").trim();
    // Com título, o item é uma subseção com nome; sem título, o parágrafo emenda no número e a
    // subseção fica com o número por endereço — que é como o livro se cita ("ver item 68").
    const named = title !== "" && ratio >= 1.2;
    return {
      kind: "SUBSECTION",
      label: `${number}.`,
      number,
      title: named ? title : null,
      extent: "heading",
      lines: 1,
      confidence: { pattern: 0.9, typography: named ? 0.95 : 0.8 },
      evidence: [
        "item de teoria numerado",
        `número em ${prefix.toFixed(2)}× o corpo do livro`,
        ...(named ? ["com título próprio"] : ["o parágrafo emenda no número"]),
      ],
    };
  }

  if (open.has("EXERCISE_GROUP") && prefix <= 1.1) {
    const previous = context.lastSibling("EXERCISE");
    const anterior = previous?.number ? Number.parseInt(previous.number, 10) : null;
    const atual = Number.parseInt(number, 10);
    // A coleção numera os exercícios de 1 a 568 sem reiniciar: cada bloco continua a conta do
    // anterior. Seguir o último é a evidência forte; recomeçar do 1 seria a suspeita.
    const continuity = anterior === null ? 0.8 : atual === anterior + 1 ? 0.97 : atual > anterior ? 0.85 : 0.4;
    return {
      kind: "EXERCISE",
      label: `${number}.`,
      number,
      extent: "until-boundary",
      title: null,
      lines: 1,
      confidence: { pattern: 0.9, continuity, typography: 0.9 },
      evidence: [
        "número em negrito no corpo do texto, dentro de um bloco de exercícios",
        anterior === null ? "primeiro do bloco" : `segue o ${anterior}`,
      ],
    };
  }

  return null;
}

/** Os itens `a)`, `b)` de um exercício — e as alternativas de uma questão de vestibular. */
function classifyItem(context: WalkContext): AnchorMatch | null {
  const { line } = context;
  const match = ITEM.exec(line.text.trim());
  if (!match) return null;
  return {
    kind: "ITEM",
    label: `${match[1]})`,
    number: match[1] ?? null,
    title: null,
    extent: "paragraph",
    lines: 1,
    confidence: { pattern: 0.85, layout: 0.85 },
    evidence: ["letra seguida de parêntese, recuada sob o enunciado"],
  };
}

export const bookFmeV1: CaptureProfile = {
  id: "book-fme-v1",
  // 2: os vols. 2 a 11 — o número de resposta colado no texto, a página de abertura da zona, e
  // a lista de siglas sem "e olimpíadas".
  version: 2,
  label: "Fundamentos de Matemática Elementar",
  documentKind: "BOOK",
  description:
    "A coleção do Iezzi, onze volumes: capítulo em romano, seções I–X, itens de teoria numerados, blocos E X E R C Í C I O S, questões de vestibular no fim e dois gabaritos, cujas respostas vão às questões.",
  kinds: ["CHAPTER", "SECTION", "SUBSECTION", "CONTENT", "EXERCISE_GROUP", "EXERCISE", "QUESTION", "ITEM", "NOTE", "FIGURE", "ANSWER"],
  /*
    A coleção é diagramada em uma coluna. O que parece coluna dupla é a grade dos itens curtos —
    `a)` e `b)` lado a lado, `c)` e `d)` embaixo —, e a detecção de colunas a lia como duas
    colunas: o volume 1 saía com os itens a, c, b, d, e a coluna da direita caía no último
    exercício da página. As alternativas da zona de vestibulares são a mesma grade.
  */
  singleColumn: true,
  settings: {
    // O corpo do livro é discursivo; a zona de vestibular carimba múltipla escolha por item.
    defaultQuestionType: "DISCURSIVE",
    emitContent: true,
    autoAcceptThreshold: 0.85,
  },

  /*
    As quatro zonas, achadas pelo cabeçalho corrente que se repete em todas as páginas de cada uma.

    O cabeçalho, e não o título grande de abertura: o título vem quebrado em duas linhas
    ("Respostas" / "dos exercícios") e só aparece uma vez, enquanto o cabeçalho aparece em todas.
    A comparação é por igualdade da linha inteira, o que descarta de graça a linha do sumário
    ("Respostas dos exercícios ..... 270"), que traz os pontinhos e o número da página.

    Mas a página que abre a zona não tem o cabeçalho, só o título grande: no vol. 11, a abertura
    das "Questões de / vestibulares" trazia as questões 1 a 3 e ficava na zona anterior, que não é
    varrida. Se a página de antes da primeira com o cabeçalho tem o título grande da zona — as
    linhas grandes, juntas, dizem o cabeçalho —, a zona começa nela.
  */
  zones(pages: readonly PageModel[]): readonly DocumentZone[] {
    const found = new Map<string, number>();
    for (const page of pages) {
      for (const line of page.lines) {
        const marker = markerOf(upper(line));
        if (marker && !found.has(marker.header)) found.set(marker.header, page.pageNumber);
      }
    }

    const style = measureStyle(pages.flatMap((page) => page.lines));
    const titleOf = (page: PageModel | undefined) =>
      (page?.lines ?? [])
        .filter((line) => relativeSize(line, style) >= 2.5)
        .map(upper)
        .join(" ");
    const byNumber = new Map(pages.map((page) => [page.pageNumber, page]));

    const zones: DocumentZone[] = [{ label: "corpo", from: 1 }];
    for (const marker of ZONE_MARKERS) {
      const first = found.get(marker.header);
      if (first === undefined) continue;
      const opens = titleOf(byNumber.get(first - 1)) === marker.header;
      zones.push({ ...marker.zone, from: opens ? first - 1 : first });
    }
    // Depois das siglas vem a contracapa — a coleção, os volumes —, que não é conteúdo do livro.
    const siglas = pages.filter((page) => page.lines.some((line) => isSiglasHeader(upper(line))));
    const ultima = siglas.at(-1)?.pageNumber;
    if (ultima !== undefined && pages.some((page) => page.pageNumber > ultima)) {
      zones.push({ label: "contracapa", from: ultima + 1, skip: true });
    }
    return zones.sort((a, b) => a.from - b.from);
  },

  /*
    Dois sinais que praticamente só esta coleção tem: o banner com as letras separadas e a seção
    numerada em romano em corpo de título. Um livro que traga os dois é um Fundamentos.
  */
  /*
    As respostas: "135. a) {9, 6, 3}" no gabarito dos exercícios, "36. d" no dos vestibulares.

    O número vem no começo da linha, seguido de ponto e de espaço — "2.5" é número, não resposta.
    O motor descarta o número que não avança, que é o "2." de dentro de uma resposta.
  */
  answerStart(line) {
    const match = ANSWER_START.exec(line.text.trim());
    return match ? { number: match[1]!, label: `${match[1]}.` } : null;
  },

  // "Capítulo II" (13 pt) e o título de abertura da zona (31,5 pt) fecham a resposta aberta.
  answerBoundary(line, style) {
    return relativeSize(line, style) >= 1.2 && !/^\d/.test(line.text.trim());
  },

  score(sample) {
    const paginas = Math.max(1, sample.length);
    const style = measureStyle(sample.flatMap((page) => page.lines));
    let banners = 0;
    let romanas = 0;
    let capitulos = 0;
    for (const page of sample) {
      for (const line of page.lines) {
        if (isBanner(line, style)) banners++;
        else if (ehCapitulo(line, style)) capitulos++;
        else if (ehSecaoRomana(line, style)) romanas++;
      }
    }

    const sinais = banners * 3 + romanas * 2 + capitulos * 3;
    return {
      score: Math.min(1, sinais / (paginas * 2)),
      evidence: `${banners} banners de exercícios, ${romanas} seções em romano e ${capitulos} capítulos em ${paginas} páginas`,
    };
  },

  classifyLine(context) {
    return classify(context) ?? classifyItem(context);
  },

  canContain(parent, child) {
    return (CONTAINS[parent ?? "ROOT"] ?? []).includes(child);
  },

  /** Nada disto é mobília, e nada disto pode ser engolido por uma figura. */
  isProtected(line, style) {
    /*
      O título de capítulo entra aqui por uma razão medida: a página de abertura de cada capítulo
      traz uma ilustração grande, e "CAPÍTULO I" tem dez caracteres — curto o bastante para a
      figura o engolir como se fosse rótulo do desenho. Foi o que aconteceu na primeira medição:
      dez capítulos existiam no PDF em 2,80× o corpo, e nenhum chegava à proposta.
    */
    // A LEITURA da p. 211 tem o retrato do Boole logo acima, e o "LEITURA" era engolido como
    // rótulo do desenho: a seção nascia sem o rótulo.
    if (ehCapitulo(line, style) || isBanner(line, style) || ehSecaoRomana(line, style) || ehTituloDeSecao(line, style)) return true;
    return prefixBold(line) && NUMBER_SPAN.test(line.spans[0]?.text.trim() ?? "") && relativeSize(line, style) <= 1.5;
  },

  buildSemanticPrompt: (input) =>
    semanticPrompt(
      input,
      "O documento é um volume do Fundamentos de Matemática Elementar. Distinga teoria (CONTENT), item de teoria numerado (SUBSECTION), exercício proposto (EXERCISE) e questão de vestibular (QUESTION).",
    ),
};
