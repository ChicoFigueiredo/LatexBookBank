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

const CHAPTER = /^CAPITULO\s+([IVXLC]+)\b\s*(.*)$/i;
/** `IV. Conjunto universo` e `III.Conjunto unitário` — o livro às vezes come o espaço. */
const SECTION_ROMAN = /^([IVXLC]{1,7})\s*\.\s*(\S.*)$/;
/** `E X E R C Í C I O S`, e as quatro ocorrências que o extrator lê sem o S final. */
const SPACED_EXERCISES = /^E\s+X\s+E\s+R\s+C\s+I\s+C\s+I\s+O\s*S?$/i;
/** O número no primeiro span: `135.` do exercício, `68.` do item de teoria. */
const NUMBER_SPAN = /^(\d{1,3})\.$/;
const NUMBER_LINE = /^(\d{1,3})\.\s*(.*)$/;
/** `1. (UF-RS) …` — a banca entre parênteses é o que marca a questão de vestibular. */
const VESTIBULAR = /^(\d{1,3})\s*\.\s*\(([^)]{2,40})\)\s*(.*)$/;
const ITEM = /^\(?([a-z])\)\s/;

/** O cabeçalho corrente que anuncia cada zona, na forma em que o extrator o entrega. */
const ZONE_MARKERS: readonly { readonly header: string; readonly zone: Omit<DocumentZone, "from"> }[] = [
  {
    header: "RESPOSTAS DAS QUESTOES DE VESTIBULARES",
    zone: { label: "respostas dos vestibulares", skip: true },
  },
  { header: "RESPOSTAS DOS EXERCICIOS", zone: { label: "respostas dos exercícios", skip: true } },
  {
    header: "QUESTOES DE VESTIBULARES",
    zone: { label: "questões de vestibulares", questionType: "MULTIPLE_CHOICE" },
  },
];

const fold = (line: TextLine) => stripAccents(line.text).trim();

/*
  Os três marcos da coleção, cada um num lugar só.

  Eles são consultados de três pontos — a classificação, a nota do perfil e a proteção contra
  figura — e, escritos três vezes, os limiares divergiam em silêncio: o banner exigia 1,5× num
  lugar e nada no outro. Um marco, uma definição.
*/
const ehBanner = (line: TextLine, style: PublicationStyle): boolean =>
  SPACED_EXERCISES.test(fold(line)) && relativeSize(line, style) >= 1.5;

const ehSecaoRomana = (line: TextLine, style: PublicationStyle): boolean =>
  line.bold && relativeSize(line, style) >= 1.4 && SECTION_ROMAN.test(line.text.trim());

const ehCapitulo = (line: TextLine, style: PublicationStyle): boolean =>
  CHAPTER.test(fold(line)) && relativeSize(line, style) >= 2;
const upper = (line: TextLine) => stripAccents(line.text).replace(/\s+/g, " ").trim().toUpperCase();

/** O corpo do primeiro span, em múltiplos do corpo do livro. É ele que separa exercício de teoria. */
function prefixRatio(line: TextLine, style: PublicationStyle): number {
  const first = line.spans[0];
  if (!first || style.bodySize <= 0) return relativeSize(line, style);
  return first.size / style.bodySize;
}

const prefixBold = (line: TextLine): boolean => line.spans[0]?.bold ?? line.bold;

const CONTAINS: Readonly<Record<string, readonly ScanKind[]>> = {
  ROOT: ["CHAPTER", "SECTION", "EXERCISE_GROUP", "QUESTION", "FIGURE"],
  CHAPTER: ["SECTION", "SUBSECTION", "CONTENT", "EXERCISE_GROUP", "NOTE", "FIGURE"],
  SECTION: ["SUBSECTION", "CONTENT", "EXERCISE_GROUP", "NOTE", "FIGURE"],
  SUBSECTION: ["CONTENT", "EXERCISE_GROUP", "NOTE", "FIGURE"],
  EXERCISE_GROUP: ["EXERCISE"],
  EXERCISE: ["ITEM", "FIGURE"],
  QUESTION: ["ITEM", "FIGURE"],
};

function classify(context: WalkContext): AnchorMatch | null {
  const { line, style } = context;
  const text = fold(line);
  const ratio = relativeSize(line, style);
  const open = new Set(context.open.map((element) => element.kind));

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
    const title = abaixo.length > 0 ? abaixo.join(" ") : (chapter[2] ?? "").trim();
    return {
      kind: "CHAPTER",
      label: line.text.trim(),
      number: chapter[1] ?? null,
      title: title || null,
      extent: "heading",
      lines: 1 + abaixo.length,
      confidence: { pattern: 0.97, typography: 0.98 },
      evidence: ["CAPÍTULO em romano", `corpo ${ratio.toFixed(2)}× o do livro`],
    };
  }

  // IV. Conjunto universo — a seção, em romano e 1,5× o corpo.
  const roman = SECTION_ROMAN.exec(line.text.trim());
  if (roman && ehSecaoRomana(line, style)) {
    return {
      kind: "SECTION",
      label: line.text.trim(),
      number: roman[1] ?? null,
      title: (roman[2] ?? "").trim() || null,
      extent: "heading",
      lines: 1,
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
  if (ehBanner(line, style)) {
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

  // 1. (UF-RS) … — a questão de vestibular, reconhecida pela banca entre parênteses.
  /*
    A questão de vestibular, e só dentro da zona que as abriga.

    A banca entre parênteses é o sinal, mas ela sozinha não basta: um exercício do corpo pode
    citar uma banca e continuar sendo exercício do livro. Quem decide é a zona — é para isso que
    ela chega até aqui.

    O `closes` é necessário porque o último bloco de exercícios do corpo continua aberto quando a
    caminhada chega aos vestibulares: as páginas de gabarito entre os dois foram puladas, e não
    sobrou âncora nenhuma no meio para fechá-lo.
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
      closes: ["EXERCISE_GROUP", "EXERCISE"],
    };
  }

  const numbered = NUMBER_LINE.exec(line.text.trim());
  if (!numbered || !prefixBold(line)) return null;
  const number = numbered[1] ?? "";
  const prefix = prefixRatio(line, style);

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
  version: 1,
  label: "Fundamentos de Matemática Elementar",
  documentKind: "BOOK",
  description:
    "A coleção do Iezzi, onze volumes: capítulo em romano, seções I–X, itens de teoria numerados, blocos E X E R C Í C I O S, questões de vestibular no fim e dois gabaritos, que não são varridos.",
  kinds: ["CHAPTER", "SECTION", "SUBSECTION", "CONTENT", "EXERCISE_GROUP", "EXERCISE", "QUESTION", "ITEM", "NOTE", "FIGURE"],
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
  */
  zones(pages: readonly PageModel[]): readonly DocumentZone[] {
    const found = new Map<string, number>();
    for (const page of pages) {
      for (const line of page.lines) {
        const header = upper(line);
        const marker = ZONE_MARKERS.find((candidate) => candidate.header === header);
        if (marker && !found.has(marker.header)) found.set(marker.header, page.pageNumber);
      }
    }

    const zones: DocumentZone[] = [{ label: "corpo", from: 1 }];
    for (const marker of ZONE_MARKERS) {
      const from = found.get(marker.header);
      if (from !== undefined) zones.push({ ...marker.zone, from });
    }
    return zones.sort((a, b) => a.from - b.from);
  },

  /*
    Dois sinais que praticamente só esta coleção tem: o banner com as letras separadas e a seção
    numerada em romano em corpo de título. Um livro que traga os dois é um Fundamentos.
  */
  score(sample) {
    const paginas = Math.max(1, sample.length);
    const style = measureStyle(sample.flatMap((page) => page.lines));
    let banners = 0;
    let romanas = 0;
    let capitulos = 0;
    for (const page of sample) {
      for (const line of page.lines) {
        if (ehBanner(line, style)) banners++;
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
    if (ehCapitulo(line, style) || ehBanner(line, style) || ehSecaoRomana(line, style)) return true;
    return prefixBold(line) && NUMBER_SPAN.test(line.spans[0]?.text.trim() ?? "") && relativeSize(line, style) <= 1.5;
  },

  buildSemanticPrompt: (input) =>
    semanticPrompt(
      input,
      "O documento é um volume do Fundamentos de Matemática Elementar. Distinga teoria (CONTENT), item de teoria numerado (SUBSECTION), exercício proposto (EXERCISE) e questão de vestibular (QUESTION).",
    ),
};
