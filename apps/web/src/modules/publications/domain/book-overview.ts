/**
 * O que a tela de overview do livro precisa saber, e nada disso é consulta.
 *
 * A parada entre escolher um livro e editá-lo existe no protótipo (492–599) porque a pergunta que
 * ela responde não é "onde está a questão 27" — é "este livro está pronto?". Responder isso é
 * contar, e contar em árvore é o tipo de código que passa a errar em silêncio quando alguém muda o
 * formato do `kind`. Aqui, puro e com teste.
 */

/** A projeção mínima de um nó para a conta. O read model carrega isto e mais nada. */
export interface NoDaEstrutura {
  readonly id: string;
  readonly parentId: string | null;
  readonly kind: string;
  readonly title: string | null;
  readonly originalLabel: string | null;
  readonly sortKey: string;
  /** Tem questão pendurada — é uma folha que conta. */
  readonly isQuestion: boolean;
  /** A validação reprovou. Só faz sentido quando `isQuestion`. */
  readonly isInvalid: boolean;
}

export interface CapituloDoLivro {
  readonly id: string;
  /** "1", "II", "12" — o rótulo do próprio livro quando existe, senão a posição. */
  readonly label: string;
  readonly title: string;
  readonly questionCount: number;
  readonly invalidCount: number;
  /** Questões que passaram na validação — o que a barra preenche. */
  readonly reviewedCount: number;
  /** 0–100, já arredondado. Capítulo sem questão é 0, e não 100. */
  readonly pct: number;
}

/**
 * Os capítulos, com o que cada um carrega **abaixo** dele.
 *
 * Contar só os filhos diretos daria zero em qualquer livro real: a questão mora dentro de
 * `SECTION › QUESTION_GROUP`, dois ou três níveis abaixo do capítulo. A conta é da subárvore
 * inteira, e é por isso que ela é feita aqui em memória a partir de uma consulta só, em vez de
 * uma consulta recursiva por capítulo.
 *
 * Nó órfão — pai apagado logicamente enquanto o filho ficou — não entra em capítulo nenhum em vez
 * de derrubar a tela. O acervo importado do legado tem alguns.
 */
export function sumarizarCapitulos(nos: readonly NoDaEstrutura[]): readonly CapituloDoLivro[] {
  const porPai = new Map<string | null, NoDaEstrutura[]>();
  for (const no of nos) {
    const irmaos = porPai.get(no.parentId);
    if (irmaos) irmaos.push(no);
    else porPai.set(no.parentId, [no]);
  }

  const capitulos = nos
    .filter((no) => no.kind === "CHAPTER")
    .sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0));

  return capitulos.map((capitulo, indice) => {
    const { questionCount, invalidCount } = contarSubarvore(capitulo, porPai);
    const reviewedCount = questionCount - invalidCount;

    return {
      id: capitulo.id,
      label: capitulo.originalLabel?.trim() || String(indice + 1),
      title: capitulo.title?.trim() || "Capítulo sem título",
      questionCount,
      invalidCount,
      reviewedCount,
      pct: questionCount === 0 ? 0 : Math.round((reviewedCount / questionCount) * 100),
    };
  });
}

/**
 * Percorre a subárvore sem recursão.
 *
 * Iterativo por precaução barata: o legado tem livros com aninhamento fundo, e uma pilha explícita
 * custa o mesmo que a recursão e não tem fundo de pilha para estourar. O `visitados` protege de
 * ciclo — que não deveria existir, mas derrubaria a tela inteira se existisse.
 */
function contarSubarvore(
  raiz: NoDaEstrutura,
  porPai: ReadonlyMap<string | null, readonly NoDaEstrutura[]>,
): { questionCount: number; invalidCount: number } {
  let questionCount = 0;
  let invalidCount = 0;

  const pilha: NoDaEstrutura[] = [raiz];
  const visitados = new Set<string>([raiz.id]);

  while (pilha.length > 0) {
    const atual = pilha.pop();
    if (!atual) break;

    if (atual.isQuestion) {
      questionCount += 1;
      if (atual.isInvalid) invalidCount += 1;
    }

    for (const filho of porPai.get(atual.id) ?? []) {
      if (visitados.has(filho.id)) continue;
      visitados.add(filho.id);
      pilha.push(filho);
    }
  }

  return { questionCount, invalidCount };
}

/**
 * "38,2 MB" — vírgula, porque o produto é em português e o número é lido, não calculado.
 *
 * Abaixo de 1 MB vira KB inteiro: "0,4 MB" não diz nada que "412 KB" não diga melhor.
 */
export function formatarTamanho(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;

  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/**
 * O progresso da captura — e por que o denominador do protótipo não existe aqui.
 *
 * O protótipo escreve `148 / ~410`, onde 410 é a estimativa por página do PDF. **Não temos a
 * contagem de páginas**: ela é derivada no cliente pelo `PdfCropViewer` e nunca guardada, e a Home
 * já tomou essa decisão uma vez (`prisma-home-overview.ts`) — inventar um total para preencher uma
 * barra é escrever ficção num lugar onde o usuário decide o que fazer a seguir.
 *
 * O que o banco sabe é melhor e é verdade: quantos recortes viraram questão, quantos ainda estão
 * na fila, e até que página do livro alguém chegou. A barra usa o único denominador real que
 * existe — o total de recortes feitos.
 */
export interface ProgressoDeCaptura {
  /** Recortes que viraram questão. */
  readonly captured: number;
  /** Recortes feitos e ainda não convertidos — a fila. */
  readonly queued: number;
  /** Página mais funda já recortada. `null` quando ninguém recortou nada ainda. */
  readonly lastPage: number | null;
  readonly pct: number;
  readonly label: string;
}

export function resumirCaptura(
  captured: number,
  queued: number,
  lastPage: number | null,
): ProgressoDeCaptura | null {
  const total = captured + queued;
  if (total === 0) return null;

  return {
    captured,
    queued,
    lastPage,
    pct: Math.round((captured / total) * 100),
    label: `${captured} / ${total} recortes`,
  };
}

/**
 * "capítulos 1–4 revisados" — a faixa **contígua** desde o começo, e não o total espalhado.
 *
 * A diferença importa: "6 capítulos revisados" num livro em que os revisados são o 1, 3, 7, 8, 9 e
 * 12 não diz onde retomar. A faixa desde o início diz — é a fronteira do trabalho, que é a
 * pergunta que alguém faz olhando esta caixa.
 *
 * Capítulo sem questão nenhuma não conta como revisado: vazio não é pronto.
 */
export function faixaRevisada(capitulos: readonly CapituloDoLivro[]): string | null {
  let fim = 0;
  for (const capitulo of capitulos) {
    if (capitulo.questionCount === 0 || capitulo.invalidCount > 0) break;
    fim += 1;
  }

  if (fim === 0) return null;
  if (fim === 1) return `capítulo ${capitulos[0]?.label} revisado`;

  return `capítulos ${capitulos[0]?.label}–${capitulos[fim - 1]?.label} revisados`;
}
