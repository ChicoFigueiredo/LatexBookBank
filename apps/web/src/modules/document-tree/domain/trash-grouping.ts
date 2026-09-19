/**
 * A lixeira mostra **o que foi excluído**, e não cada linha que a exclusão tocou.
 *
 * Excluir um grupo de exercícios apaga o grupo e as seis questões dentro dele: sete linhas em
 * `document_nodes`, um ato do usuário. A lixeira por publicação lista as sete, e isso já era ruim
 * numa tela pequena; na lixeira **global**, com todo o acervo dentro, é uma lista impossível de
 * ler — e pior, sugere sete decisões onde há uma.
 *
 * O protótipo (1889–1921) resolve com uma linha por ato e a conta do que veio junto: “levou 6
 * questões com ele”, `Restaurar (7 itens)`, e no rodapé `2 itens · 8 objetos`. Este módulo é essa
 * conta, e é pura porque errá-la significa oferecer ao usuário um "restaurar" que devolve menos do
 * que promete.
 */

/** A projeção mínima de um nó excluído. O read model carrega isto e o rótulo do livro. */
export interface NoExcluido {
  readonly id: string;
  readonly parentId: string | null;
  readonly kind: string;
  readonly title: string | null;
  readonly originalLabel: string | null;
  readonly deletedAt: Date;
  /** Tem questão pendurada — é um objeto de conteúdo, e não só estrutura. */
  readonly hasQuestion: boolean;
  /** O apelido da questão, quando há. É o único nome legível que a questão do acervo carrega. */
  readonly nickname: string | null;
}

export interface AtoDeExclusao {
  /** O nó que o usuário mandou para a lixeira — a raiz do que foi excluído junto. */
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly deletedAt: Date;
  /** Quantos nós voltam se este for restaurado, ele inclusive. */
  readonly restoresCount: number;
  /** Quantas questões foram junto — o “levou 6 questões com ele”. */
  readonly questionsTaken: number;
}

export interface ResumoDaLixeira {
  readonly atos: readonly AtoDeExclusao[];
  /** Atos — o que a linha do rodapé chama de “itens”. */
  readonly itemCount: number;
  /** Nós na lixeira, somando a descendência — o que o rodapé chama de “objetos”. */
  readonly objectCount: number;
}

/**
 * Agrupa os nós excluídos pelo **ato** que os excluiu.
 *
 * A raiz de um ato é o nó excluído cujo pai **não** está na lixeira. É a mesma regra que o
 * `restoreNode` usa para recusar restaurar um nó com ancestral excluído — e não é coincidência:
 * um ato é exatamente o que pode voltar de uma vez.
 *
 * Um nó cujo pai foi excluído **depois**, em outro ato, também aparece com o pai na lixeira e
 * portanto não vira raiz. Está certo: restaurá-lo sozinho o devolveria para debaixo de um pai
 * invisível, que é o defeito que a regra existe para evitar.
 */
export function agruparLixeira(nos: readonly NoExcluido[]): ResumoDaLixeira {
  const naLixeira = new Set(nos.map((no) => no.id));

  const filhos = new Map<string, NoExcluido[]>();
  for (const no of nos) {
    if (no.parentId === null) continue;
    const lista = filhos.get(no.parentId);
    if (lista) lista.push(no);
    else filhos.set(no.parentId, [no]);
  }

  const raizes = nos.filter((no) => no.parentId === null || !naLixeira.has(no.parentId));

  const atos = raizes
    .map((raiz): AtoDeExclusao => {
      const { total, questions } = contarSubarvore(raiz, filhos);

      return {
        id: raiz.id,
        kind: raiz.kind,
        title: rotular(raiz),
        deletedAt: raiz.deletedAt,
        restoresCount: total,
        // A própria raiz, quando é questão, não "veio junto" — ela é o que foi excluído.
        questionsTaken: raiz.hasQuestion ? questions - 1 : questions,
      };
    })
    .sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime());

  return {
    atos,
    itemCount: atos.length,
    objectCount: nos.length,
  };
}

/**
 * Como a linha se chama — e é aqui que a lixeira é mais exigente que qualquer outra tela.
 *
 * A questão do acervo real quase nunca tem `title`: ela se identifica pelo rótulo do próprio livro
 * (`27`, `II`), que é o que o `duplicateSubtree` já aprendeu a não descartar, e pelo apelido que
 * alguém deu a ela. Em qualquer outra tela há contexto em volta; aqui a linha **é** todo o
 * contexto, e é só com ela que se decide restaurar ou apagar de vez.
 *
 * O protótipo escreve `Questão 33 · Progressão aritmética` — rótulo e apelido, nessa ordem: o
 * número localiza no livro, o apelido diz do que se trata. Quem tem só um dos dois mostra o que
 * tem; quem não tem nenhum sobra com o tipo, que ainda diz mais que "sem título".
 */
function rotular(no: NoExcluido): string {
  const titulo = no.title?.trim();
  const apelido = no.nickname?.trim();
  const rotulo = no.originalLabel?.trim();

  const nome = titulo || (rotulo ? `${nomeDoTipo(no.kind)} ${rotulo}` : nomeDoTipo(no.kind));

  // O apelido não repete o que o nome já diz: uma questão apelidada "27" com rótulo 27 viraria
  // "Questão 27 · 27", que é ruído com cara de informação.
  return apelido && apelido !== titulo && apelido !== rotulo ? `${nome} · ${apelido}` : nome;
}

const NOMES: Readonly<Record<string, string>> = {
  BOOK: "Livro",
  PART: "Parte",
  CHAPTER: "Capítulo",
  SECTION: "Seção",
  SUBSECTION: "Subseção",
  CONTENT: "Conteúdo",
  QUESTION_GROUP: "Grupo",
  QUESTION: "Questão",
  FIGURE: "Figura",
  NOTE: "Nota",
  EXAMPLE: "Exemplo",
};

export const nomeDoTipo = (kind: string): string => NOMES[kind] ?? "Nó";

/** Iterativo e com `visitados`, pelo mesmo motivo do overview: ciclo não pode derrubar a tela. */
function contarSubarvore(
  raiz: NoExcluido,
  filhos: ReadonlyMap<string, readonly NoExcluido[]>,
): { total: number; questions: number } {
  let total = 0;
  let questions = 0;

  const pilha: NoExcluido[] = [raiz];
  const visitados = new Set<string>([raiz.id]);

  while (pilha.length > 0) {
    const atual = pilha.pop();
    if (!atual) break;

    total += 1;
    if (atual.hasQuestion) questions += 1;

    for (const filho of filhos.get(atual.id) ?? []) {
      if (visitados.has(filho.id)) continue;
      visitados.add(filho.id);
      pilha.push(filho);
    }
  }

  return { total, questions };
}

/**
 * "levou 6 questões com ele" — e nada, quando não levou nada.
 *
 * A frase só aparece quando há o que dizer. "levou 0 questões" é uma linha ocupando espaço para
 * informar que não havia informação, e o protótipo põe esta em `--danger-text` justamente porque
 * ela é o aviso: restaurar o grupo é a única forma de aquelas seis voltarem.
 */
export function frasedoQueLevou(ato: AtoDeExclusao): string | null {
  if (ato.questionsTaken === 0) return null;

  return ato.questionsTaken === 1
    ? "levou 1 questão com ele"
    : `levou ${ato.questionsTaken} questões com ele`;
}

/** "2 itens · 8 objetos" — o rodapé, no plural certo. */
export const contagemDoRodape = (resumo: ResumoDaLixeira): string =>
  `${resumo.itemCount} ${resumo.itemCount === 1 ? "item" : "itens"} · ` +
  `${resumo.objectCount} ${resumo.objectCount === 1 ? "objeto" : "objetos"}`;
