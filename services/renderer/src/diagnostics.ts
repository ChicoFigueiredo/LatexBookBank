import type { RenderDiagnostic } from "@latexbookbank/render-contract";

/**
 * O log do LaTeX traduzido em diagnóstico.
 *
 * O critério de aceite da fase é explícito: **erro de TeX aparece como diagnóstico, não como stack
 * trace cru**. O log do `pdflatex` é o oposto disso — parênteses aninhados de arquivos abertos,
 * avisos de fonte, e no meio a linha que interessa. Quem abre o editor quer saber "linha 12, chave
 * não fechada", não ler quatrocentas linhas de TeX.
 *
 * Isto é tradução, não interpretação: quando uma linha não casa com nenhum formato conhecido, ela
 * **não** é inventada em diagnóstico. O log cru continua indo inteiro no `stdout`, e a aba "Log"
 * existe justamente para o que a tradução perdeu.
 */

/**
 * `./main.tex:4: Undefined control sequence.` — o formato do `-file-line-error`.
 *
 * É o formato que a compilação pede de propósito, e é melhor que o clássico: traz arquivo e linha
 * na mesma linha do erro, sem precisar procurar o `l.NN` algumas linhas abaixo. O padrão do
 * `pdflatex` (só `! mensagem`) continua reconhecido porque nem toda mensagem sai no formato novo.
 */
const FILE_LINE_ERROR = /^(?:\.\/)?(\S+\.\w+):(\d+):\s*(.+)$/;

/**
 * `==> Fatal error occurred` é resumo, não diagnóstico novo.
 *
 * O `pdflatex` o emite depois do erro de verdade, no mesmo formato `arquivo:linha:`. Sem esta
 * exceção, todo erro apareceria duas vezes na tela — uma com a causa e outra dizendo que houve
 * uma causa.
 */
const FATAL_SUMMARY = /==>\s*Fatal error occurred/;

/**
 * `! Undefined control sequence.` — o formato clássico de erro.
 *
 * A linha vem depois, no formato `l.12 \naoexiste`, e é por isso que a varredura precisa olhar
 * adiante em vez de casar linha a linha isolada.
 *
 * O espaço depois do `!` é **opcional**: o `pdfTeX` emite os erros dele como `!pdfTeX error: …`,
 * sem espaço, e a versão anterior desta expressão os ignorava inteiros. O sintoma era o pior
 * possível — figura corrompida, `libpng: internal error`, nenhum PDF, e a tela dizendo "Falha ao
 * compilar" **sem motivo nenhum**, com um aviso de espaçamento como única linha da lista. A §42
 * diz que erro de compilação nunca é escondido; era.
 */
const ERROR_START = /^!\s*(.+)$/;

/** `l.12 ...` — o número da linha onde o TeX parou. */
const ERROR_LINE = /^l\.(\d+)/;

/**
 * `LaTeX Error: File 'xxx.sty' not found.` — erro de LaTeX, não de TeX puro.
 * Vem depois do `!` e traz mensagem melhor; quando existe, é ela que vale.
 */
const LATEX_ERROR = /^! LaTeX Error: (.+)$/;

/** `LaTeX Warning: ...` e `Package xxx Warning: ...`, que podem continuar na linha seguinte. */
const WARNING = /^(?:LaTeX|Package \w+|Class \w+) Warning: (.+)$/;

/** `on input line 42.` no fim de um aviso. */
const WARNING_LINE = /on input line (\d+)/;

/** `Overfull \hbox` e amigos: ruído tipográfico que aparece em quase todo documento. */
const BOX_WARNING = /^(Overfull|Underfull) \\[hv]box/;

/**
 * Extrai diagnósticos do log.
 *
 * `Overfull \hbox` entra como `info`, não como `warning`: aparece em praticamente todo documento
 * com uma linha um pouco larga, e classificá-lo como aviso encheria o painel de amarelo até o
 * ponto em que ninguém mais olha — que é o mesmo que não ter aviso nenhum.
 */
export function parseLatexLog(log: string): readonly RenderDiagnostic[] {
  const lines = log.split("\n");
  const diagnostics: RenderDiagnostic[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";

    const fileLine = FILE_LINE_ERROR.exec(line);
    if (fileLine && !FATAL_SUMMARY.test(line)) {
      diagnostics.push({
        severity: "error",
        // Só o nome do arquivo: o caminho completo é o diretório temporário do job, e mandá-lo ao
        // cliente contaria como o worker organiza o disco sem ajudar ninguém a corrigir o LaTeX.
        message: (fileLine[3] ?? "").replace(/^LaTeX Error:\s*/, "").trim(),
        line: Number(fileLine[2]),
        file: (fileLine[1] ?? "").split("/").pop() ?? null,
      });
      continue;
    }

    const latexError = LATEX_ERROR.exec(line);
    const error = latexError ?? ERROR_START.exec(line);

    if (error) {
      // A linha do erro aparece algumas linhas abaixo, num `l.NN`. Olhar cinco à frente cobre o
      // formato do `pdflatex` sem atravessar para o erro seguinte.
      let lineNumber: number | null = null;
      for (let j = i + 1; j < Math.min(i + 6, lines.length); j += 1) {
        const at = ERROR_LINE.exec(lines[j] ?? "");
        if (at) {
          lineNumber = Number(at[1]);
          break;
        }
      }

      diagnostics.push({
        severity: "error",
        message: (error[1] ?? "").trim(),
        line: lineNumber,
        file: null,
      });
      continue;
    }

    if (BOX_WARNING.test(line)) {
      const at = /at lines? (\d+)/.exec(line);
      diagnostics.push({
        severity: "info",
        message: line.trim(),
        line: at ? Number(at[1]) : null,
        file: null,
      });
      continue;
    }

    const warning = WARNING.exec(line);
    if (warning) {
      // O aviso do LaTeX quebra em várias linhas quando é longo; juntar a continuação é o que
      // impede a mensagem de chegar cortada no meio de uma palavra.
      let message = warning[1] ?? "";
      let j = i + 1;
      while (
        j < lines.length &&
        (lines[j] ?? "").trim() !== "" &&
        !(lines[j] ?? "").startsWith("!")
      ) {
        const next = (lines[j] ?? "").trim();
        if (/^(LaTeX|Package \w+|Class \w+|Overfull|Underfull)/.test(next)) break;

        // `(hyperref)   removing ...` é como o LaTeX continua um aviso longo: o nome do pacote
        // entre parênteses é indentação, não conteúdo. Tratar isso como "abriu um arquivo" —
        // que é o outro significado de parêntese no log — cortava a mensagem na primeira linha.
        const continuation = /^\((\w+)\)\s*(.*)$/.exec(next);
        if (continuation) {
          message += ` ${(continuation[2] ?? "").trim()}`;
          j += 1;
          continue;
        }
        if (next.startsWith("(")) break;

        message += ` ${next}`;
        j += 1;
      }

      const at = WARNING_LINE.exec(message);
      diagnostics.push({
        severity: "warning",
        message: message.trim(),
        line: at ? Number(at[1]) : null,
        file: null,
      });
      i = j - 1;
    }
  }

  return diagnostics;
}

/**
 * Traz as linhas do documento compilado para o **corpo**.
 *
 * O `pdflatex` conta a partir do `\documentclass`, então `main.tex:14:` pode ser a linha 2 do que a
 * pessoa escreveu — o resto é preâmbulo. Sem esta tradução, decorar a linha 14 no editor apontaria
 * para um lugar arbitrário do enunciado, e o produto estaria mentindo com precisão de número.
 *
 * O deslocamento muda conforme a compilação: com o formato pré-compilado o arquivo começa direto no
 * `\begin{document}`, sem o formato ele carrega classe e preâmbulo antes. Quem sabe qual dos dois
 * aconteceu é o worker, e é por isso que a tradução mora aqui e não na aplicação.
 *
 * Erro que cai **antes** do corpo é do preâmbulo: a mensagem continua (é um erro de verdade, e
 * escondê-la deixaria a compilação falhando sem explicação), mas a linha vira `null` — apontar para
 * o texto de alguém um erro que não está nele é pior que não apontar.
 */
export function toBodyRelative(
  diagnostics: readonly RenderDiagnostic[],
  bodyOffset: number,
): readonly RenderDiagnostic[] {
  return diagnostics.map((diagnostic) => {
    if (diagnostic.line === null) return diagnostic;
    // Diagnóstico de outro arquivo — um `.sty` do preâmbulo — conta linhas do arquivo dele, e
    // subtrair o deslocamento do `main.tex` produziria um número sem significado nenhum.
    if (diagnostic.file !== null && diagnostic.file !== "main.tex") {
      return { ...diagnostic, line: null };
    }

    const line = diagnostic.line - bodyOffset;
    return line >= 1 ? { ...diagnostic, line } : { ...diagnostic, line: null };
  });
}

/**
 * O documento compilou?
 *
 * Não é "sem diagnóstico": o LaTeX produz PDF com dezenas de avisos o tempo todo, e tratar aviso
 * como falha esconderia o resultado de quem só queria ver a questão. Quem decide é a existência do
 * arquivo — e é o chamador que sabe disso.
 */
export const hasErrors = (diagnostics: readonly RenderDiagnostic[]): boolean =>
  diagnostics.some((diagnostic) => diagnostic.severity === "error");
