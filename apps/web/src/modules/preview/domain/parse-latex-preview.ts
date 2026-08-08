import type { PreviewBlock, PreviewInline, PreviewItem, PreviewStyle } from "./preview-model";

/**
 * LaTeX → `PreviewBlock[]`, para o preview rápido.
 *
 * **Não é um parser de LaTeX, e não tenta ser.** LaTeX é Turing-completo; escrever um interpretador
 * fiel aqui seria refazer o TeX em JavaScript para depois errar de um jeito mais difícil de
 * explicar. Este é um leitor do subconjunto que a spec §11 lista — parágrafos, marcadores,
 * matemática, imagens e caixas — com uma regra que vale para todo o resto:
 *
 * > **comando desconhecido some, argumento fica.**
 *
 * `\xlop{123}{45}` vira `12345`, e não um erro. É a diferença entre um preview que aproxima e um
 * preview que trava na primeira macro do acervo real. A fidelidade é da Fase 6; aqui o objetivo é
 * feedback em dezenas de milissegundos, e o aviso de divergência fica permanente na tela.
 */

/** Ambientes de lista, e se são numerados. */
const LIST_ENVIRONMENTS: Readonly<Record<string, boolean>> = {
  itemize: false,
  enumerate: true,
  description: false,
};

/** Ambientes que são matemática display por inteiro. */
const MATH_ENVIRONMENTS = new Set([
  "equation",
  "equation*",
  "align",
  "align*",
  "gather",
  "gather*",
  "displaymath",
  "eqnarray",
  "eqnarray*",
  "multline",
  "multline*",
]);

/** Ambientes que viram caixa. */
const BOX_ENVIRONMENTS = new Set([
  "tcolorbox",
  "framed",
  "mdframed",
  "quote",
  "quotation",
  "boxedminipage",
]);

const STYLE_COMMANDS: Readonly<Record<string, PreviewStyle>> = {
  textbf: "bold",
  bf: "bold",
  emph: "italic",
  textit: "italic",
  it: "italic",
  underline: "underline",
  uline: "underline",
  texttt: "code",
  verb: "code",
};

/** Comandos de um caractere que existem só para escapar o próprio caractere. */
const ESCAPED_LITERALS = new Set(["%", "$", "{", "}", "&", "_", "#", "\\"]);

/**
 * Tira os comentários.
 *
 * `\%` **não** é comentário — é um por cento literal, e o acervo está cheio deles. Confundir os
 * dois faria metade de uma questão de porcentagem desaparecer.
 */
export function stripComments(source: string): string {
  let out = "";
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === "\\" && i + 1 < source.length) {
      out += char + source[i + 1];
      i += 1;
      continue;
    }
    if (char === "%") {
      const newline = source.indexOf("\n", i);
      if (newline === -1) break;
      // A quebra de linha permanece: é ela que separa parágrafos, e comer a linha inteira
      // colaria dois parágrafos que o autor separou.
      i = newline;
      out += "\n";
      continue;
    }
    out += char;
  }
  return out;
}

/** Índice logo depois do `}` que fecha o grupo aberto em `start`, contando aninhamento. */
function endOfGroup(source: string, start: number): number {
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    if (char === "\\") {
      i += 1;
      continue;
    }
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return source.length;
}

/** Lê `{conteúdo}` a partir de `index`, pulando espaço antes. `null` se não houver grupo ali. */
function readGroup(source: string, index: number): { content: string; next: number } | null {
  let i = index;
  while (i < source.length && /\s/.test(source[i] ?? "")) i += 1;
  if (source[i] !== "{") return null;

  const end = endOfGroup(source, i);
  return { content: source.slice(i + 1, end - 1), next: end };
}

/** Lê `[opções]` a partir de `index`. Argumento opcional não aninha colchete no acervo. */
function readOptional(source: string, index: number): { content: string; next: number } | null {
  if (source[index] !== "[") return null;
  const end = source.indexOf("]", index);
  if (end === -1) return null;
  return { content: source.slice(index + 1, end), next: end + 1 };
}

/** `\includegraphics[width=0.5\textwidth]{fig}` → 0.5. `null` quando não dá para saber. */
function parseWidthFraction(options: string): number | null {
  const relative = /width\s*=\s*([\d.]+)\s*\\(?:text|line|column)width/.exec(options);
  if (relative) {
    const value = Number(relative[1]);
    return Number.isFinite(value) ? value : null;
  }
  // Largura absoluta (`width=5cm`) não vira fração: o preview não sabe a largura da página, e
  // inventar uma daria um tamanho que só coincide por acaso com o do PDF.
  return null;
}

interface EnvironmentMatch {
  readonly name: string;
  readonly body: string;
  /** Índice logo depois do `\end{...}`. */
  readonly next: number;
}

/** Casa `\begin{nome}` em `index` com o `\end{nome}` correspondente, contando aninhamento. */
function readEnvironment(source: string, index: number): EnvironmentMatch | null {
  const begin = /^\\begin\s*\{([^}]*)\}/.exec(source.slice(index));
  if (!begin) return null;

  const name = begin[1] ?? "";
  const bodyStart = index + begin[0].length;

  let depth = 1;
  const marker = new RegExp(`\\\\(begin|end)\\s*\\{${name.replace(/[*]/g, "\\*")}\\}`, "g");
  marker.lastIndex = bodyStart;

  for (let hit = marker.exec(source); hit !== null; hit = marker.exec(source)) {
    depth += hit[1] === "begin" ? 1 : -1;
    if (depth === 0) {
      return { name, body: source.slice(bodyStart, hit.index), next: hit.index + hit[0].length };
    }
  }

  // `\begin` sem `\end` é erro de digitação, e acontece o tempo todo enquanto se escreve. Tratar
  // o resto do texto como corpo mostra o que já foi escrito, em vez de esconder tudo.
  return { name, body: source.slice(bodyStart), next: source.length };
}

/** Divide o corpo de uma lista nos `\item`, ignorando `\item` de listas aninhadas. */
function splitItems(body: string): string[] {
  const items: string[] = [];
  let current: string | null = null;
  let depth = 0;

  for (let i = 0; i < body.length; i += 1) {
    if (body.startsWith("\\begin", i)) depth += 1;
    else if (body.startsWith("\\end", i)) depth -= 1;

    if (depth === 0 && body.startsWith("\\item", i)) {
      if (current !== null) items.push(current);
      current = "";
      i += "\\item".length - 1;
      // `\item[rótulo]` do `description`: o rótulo entra no texto do item.
      const optional = readOptional(body, i + 1);
      if (optional) {
        current = optional.content;
        i = optional.next - 1;
      }
      continue;
    }

    if (current !== null) current += body[i];
  }

  if (current !== null) items.push(current);
  return items;
}

/** Junta espaços e quebras simples: no LaTeX, uma quebra de linha é só um espaço. */
const collapseSpaces = (text: string): string => text.replace(/[ \t\r\n]+/g, " ");

function pushText(inlines: PreviewInline[], text: string): void {
  if (text === "") return;
  const last = inlines[inlines.length - 1];
  if (last?.kind === "text") {
    inlines[inlines.length - 1] = { kind: "text", text: last.text + text };
    return;
  }
  inlines.push({ kind: "text", text });
}

/**
 * Conteúdo de um parágrafo: texto, matemática inline, ênfase e quebras.
 *
 * O que não for reconhecido perde o comando e mantém o argumento — a mesma regra do nível de
 * bloco, aplicada aqui.
 */
export function parseInlines(source: string): readonly PreviewInline[] {
  const inlines: PreviewInline[] = [];
  let buffer = "";

  const flush = (): void => {
    pushText(inlines, collapseSpaces(buffer));
    buffer = "";
  };

  let i = 0;
  while (i < source.length) {
    const char = source[i] ?? "";

    if (char === "$") {
      // `$$` no meio de um parágrafo é matemática display mal colocada; o nível de bloco já a
      // separou, então aqui `$$` só pode ser um par vazio.
      const end = source.indexOf("$", i + 1);
      if (end === -1) {
        buffer += char;
        i += 1;
        continue;
      }
      flush();
      inlines.push({ kind: "math", latex: source.slice(i + 1, end).trim() });
      i = end + 1;
      continue;
    }

    if (char === "~") {
      // `~` no LaTeX é espaço **inquebrável**: `Figura~1` existe para que o número não caia
      // sozinho na linha seguinte. U+00A0 é a tradução exata, e um espaço comum perderia a
      // única coisa que o autor pediu ao escrever o til.
      buffer += "\u00a0";
      i += 1;
      continue;
    }

    if (char === "{") {
      // Grupo sem comando: `{\bf texto}` já foi tratado pelo comando; o que sobra é agrupamento
      // puro, e agrupamento puro não muda o texto.
      const end = endOfGroup(source, i);
      flush();
      inlines.push(...parseInlines(source.slice(i + 1, end - 1)));
      i = end;
      continue;
    }

    if (char !== "\\") {
      buffer += char;
      i += 1;
      continue;
    }

    const next = source[i + 1] ?? "";

    if (next === "\\") {
      flush();
      inlines.push({ kind: "break" });
      i += 2;
      continue;
    }

    if (ESCAPED_LITERALS.has(next)) {
      buffer += next;
      i += 2;
      continue;
    }

    if (next === "(") {
      const end = source.indexOf("\\)", i + 2);
      const stop = end === -1 ? source.length : end;
      flush();
      inlines.push({ kind: "math", latex: source.slice(i + 2, stop).trim() });
      i = end === -1 ? source.length : end + 2;
      continue;
    }

    const command = /^\\([a-zA-Z@]+)\*?/.exec(source.slice(i));
    if (!command) {
      // `\` seguido de algo que não forma comando: espaço fino, til, etc. Vira espaço.
      buffer += " ";
      i += 2;
      continue;
    }

    const name = command[1] ?? "";
    let cursor = i + command[0].length;

    const style = STYLE_COMMANDS[name];
    const group = readGroup(source, cursor);

    if (style !== undefined && group !== null) {
      flush();
      inlines.push({ kind: "styled", style, inlines: parseInlines(group.content) });
      i = group.next;
      continue;
    }

    if (name === "newline" || name === "par") {
      flush();
      inlines.push({ kind: "break" });
      i = cursor;
      continue;
    }

    // Desconhecido: descarta `[...]`, mantém o conteúdo do primeiro `{...}`, some com o resto.
    const optional = readOptional(source, cursor);
    if (optional) cursor = optional.next;

    const argument = readGroup(source, cursor);
    if (argument) {
      flush();
      inlines.push(...parseInlines(argument.content));
      i = argument.next;
      continue;
    }

    // Comando sem argumento (`\LaTeX`, `\alpha` fora de matemática): some, mas deixa o espaço —
    // senão `\alpha b` viraria `b` colado na palavra anterior.
    buffer += " ";
    i = cursor;
  }

  flush();
  return inlines;
}

/**
 * Tira o espaço das pontas do parágrafo.
 *
 * A indentação do arquivo `.tex` não é conteúdo. Sem isto, todo parágrafo escrito com recuo
 * começaria deslocado na tela, e cada item de lista carregaria o espaço que separa o `\item` do
 * texto — diferença que ninguém consegue explicar olhando o resultado.
 */
function trimEdges(inlines: readonly PreviewInline[]): readonly PreviewInline[] {
  const trimmed = [...inlines];

  const first = trimmed[0];
  if (first?.kind === "text") trimmed[0] = { kind: "text", text: first.text.trimStart() };

  const lastIndex = trimmed.length - 1;
  const last = trimmed[lastIndex];
  if (last?.kind === "text") trimmed[lastIndex] = { kind: "text", text: last.text.trimEnd() };

  return trimmed.filter((inline) => !(inline.kind === "text" && inline.text === ""));
}

/** Um parágrafo, se sobrar algo depois de tirar espaço em branco. */
function paragraphOf(text: string): PreviewBlock[] {
  if (text.trim() === "") return [];
  const inlines = trimEdges(parseInlines(text));
  const empty =
    inlines.length === 0 ||
    inlines.every((inline) => inline.kind === "text" && inline.text.trim() === "");
  return empty ? [] : [{ kind: "paragraph", inlines }];
}

/**
 * O texto em blocos.
 *
 * Imagem vira bloco mesmo quando o LaTeX a trata como inline. É simplificação consciente: no
 * acervo real toda figura está sozinha no parágrafo, e um `<img>` no meio de uma linha de texto
 * desalinharia a leitura sem ganho nenhum.
 */
export function parseLatexPreview(source: string): readonly PreviewBlock[] {
  const text = stripComments(source);
  const blocks: PreviewBlock[] = [];
  let buffer = "";

  const flush = (): void => {
    blocks.push(...paragraphOf(buffer));
    buffer = "";
  };

  let i = 0;
  while (i < text.length) {
    if (text.startsWith("$$", i)) {
      const end = text.indexOf("$$", i + 2);
      const stop = end === -1 ? text.length : end;
      flush();
      blocks.push({ kind: "displayMath", latex: text.slice(i + 2, stop).trim() });
      i = end === -1 ? text.length : end + 2;
      continue;
    }

    if (text.startsWith("\\[", i)) {
      const end = text.indexOf("\\]", i + 2);
      const stop = end === -1 ? text.length : end;
      flush();
      blocks.push({ kind: "displayMath", latex: text.slice(i + 2, stop).trim() });
      i = end === -1 ? text.length : end + 2;
      continue;
    }

    if (text.startsWith("\\includegraphics", i)) {
      let cursor = i + "\\includegraphics".length;
      const optional = readOptional(text, cursor);
      if (optional) cursor = optional.next;

      const group = readGroup(text, cursor);
      if (group) {
        flush();
        blocks.push({
          kind: "image",
          path: group.content.trim(),
          widthFraction: parseWidthFraction(optional?.content ?? ""),
        });
        i = group.next;
        continue;
      }
    }

    if (text.startsWith("\\begin", i)) {
      const environment = readEnvironment(text, i);
      if (environment) {
        flush();
        blocks.push(...blocksForEnvironment(environment));
        i = environment.next;
        continue;
      }
    }

    // Linha em branco separa parágrafos — é a única regra de espaçamento que o LaTeX tem.
    const paragraphBreak = /^[ \t]*\r?\n[ \t]*\r?\n\s*/.exec(text.slice(i));
    if (paragraphBreak) {
      flush();
      i += paragraphBreak[0].length;
      continue;
    }

    if (text[i] === "\\") {
      // Não deixa `\\begin` de outro comando ser comido caractere a caractere.
      buffer += text[i] ?? "";
      buffer += text[i + 1] ?? "";
      i += 2;
      continue;
    }

    buffer += text[i] ?? "";
    i += 1;
  }

  flush();
  return blocks;
}

function blocksForEnvironment(environment: EnvironmentMatch): readonly PreviewBlock[] {
  const { name, body } = environment;

  if (MATH_ENVIRONMENTS.has(name)) {
    return [{ kind: "displayMath", latex: body.trim() }];
  }

  if (BOX_ENVIRONMENTS.has(name)) {
    // `tcolorbox` tem argumento opcional de opções antes do conteúdo; ele não interessa ao preview.
    const optional = readOptional(body.trimStart(), 0);
    const content = optional ? body.trimStart().slice(optional.next) : body;
    return [{ kind: "box", blocks: parseLatexPreview(content) }];
  }

  const ordered = LIST_ENVIRONMENTS[name];
  if (ordered !== undefined) {
    const items: PreviewItem[] = splitItems(body).flatMap((item) => {
      const parsed = parseLatexPreview(item);
      return parsed.length === 0 ? [] : [{ blocks: parsed }];
    });
    return items.length === 0 ? [] : [{ kind: "list", ordered, items }];
  }

  // Ambiente desconhecido — `center`, `figure`, `minipage` — desembrulha. É a mesma regra dos
  // comandos: o conteúdo importa, o invólucro não. `tabular` sai como texto corrido, e sai torto;
  // tabela não está no subconjunto da §11 e quem precisa de tabela precisa do PDF.
  return parseLatexPreview(body);
}
