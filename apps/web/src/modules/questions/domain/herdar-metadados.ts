import { buildTree, walkTree } from "@modules/document-tree/domain/build-tree";
import type {
  TreeNodeRecord,
  TreeQuestionRecord,
} from "@modules/document-tree/domain/document-tree-repository";

/**
 * O que a questão nova herda da anterior.
 *
 * O protótipo põe isto no rodapé do seletor de tipo, numa frase só: “Herda livro, capítulo e
 * **metadados** da questão anterior.” Livro e capítulo o app já herdava — são o destino escolhido
 * na árvore. Metadados, não: cada questão nascia com `board` e `year` vazios.
 *
 * O custo disso não aparece numa questão; aparece na quadragésima. Cadastrar uma prova inteira é
 * cadastrar quarenta questões da **mesma** banca e do **mesmo** ano, e o app pedia os dois campos
 * quarenta vezes — trabalho que a máquina tinha como fazer, com a resposta já na tela ao lado.
 *
 * Duas decisões de forma:
 *
 *   - **Herda por posição, não por recência.** A anterior é a que vem antes na ordem de leitura do
 *     livro, e não a última que foi criada. Quem volta ao Capítulo 2 para inserir uma questão
 *     esquecida quer a banca do Capítulo 2, não a da que acabou de digitar no Capítulo 9.
 *   - **Só herda quando há o que herdar.** Sem banca e sem ano, não há herança — e aí a
 *     dificuldade também não vem junto. Puxar `difficulty` sozinha mudaria um campo que ninguém
 *     pediu, sem nada na tela para explicar de onde veio, que é exatamente o defeito que este
 *     dossiê encontra em toda página: o produto sabia e não disse.
 */

export interface MetadadosHerdados {
  readonly board: string | null;
  readonly year: number | null;
  readonly difficulty: number;
}

/** Posição onde a questão nova vai entrar, já resolvida pelo domínio da árvore. */
export interface PosicaoNova {
  readonly parentId: string | null;
  readonly sortKey: string;
}

/**
 * Id do nó fantasma que ocupa a posição da questão que ainda não existe.
 *
 * `:` não aparece em uuid, então não colide — e mesmo que colidisse, o pior caso seria herdar de
 * uma questão vizinha em vez da anterior.
 */
const MARCADOR = "lbb:posicao-nova";

/**
 * A questão que vem imediatamente antes desta posição, na ordem de leitura.
 *
 * Monta a árvore com um nó fantasma na posição pedida e caminha até ele: reaproveita
 * `buildTree`/`walkTree`, que já resolvem irmão fora de ordem, órfão e ciclo. A alternativa —
 * comparar `sortKey` entre irmãos à mão — daria a resposta errada justamente na inserção no fim de
 * um capítulo, onde a anterior está **dentro** do irmão de cima, e não é o irmão de cima.
 */
export function questaoAnterior(
  records: readonly TreeNodeRecord[],
  posicao: PosicaoNova,
): TreeQuestionRecord | null {
  /*
   * Destino que não existe nesta árvore é caso de rota, e não de herança: `buildTree` promoveria o
   * fantasma a raiz — no **fim** — e a "anterior" viraria a última questão do livro inteiro. Sair
   * antes é o que impede uma posição inválida de virar um palpite plausível.
   */
  if (posicao.parentId !== null && !records.some((record) => record.id === posicao.parentId)) {
    return null;
  }

  const fantasma: TreeNodeRecord = {
    id: MARCADOR,
    parentId: posicao.parentId,
    kind: "QUESTION",
    title: null,
    sortKey: posicao.sortKey,
    numberingStyle: "ARABIC",
    originalLabel: null,
    question: null,
  };

  let ultima: TreeQuestionRecord | null = null;

  for (const { node } of walkTree(buildTree([...records, fantasma]))) {
    if (node.id === MARCADOR) return ultima;
    if (node.question !== null) ultima = node.question;
  }

  // Inalcançável com a guarda acima; deixado porque `walkTree` é um gerador e o compilador precisa
  // do retorno em todos os caminhos.
  return null;
}

/** Os campos herdáveis da anterior — ou `null` quando não há o que herdar. */
export function metadadosHerdados(anterior: TreeQuestionRecord | null): MetadadosHerdados | null {
  if (anterior === null) return null;
  if (anterior.board === null && anterior.year === null) return null;

  return { board: anterior.board, year: anterior.year, difficulty: anterior.difficulty };
}

/**
 * A frase que o menu mostra antes do clique.
 *
 * Herança em silêncio é pior que herança nenhuma: quem não viu de onde veio o `2019` vai procurar
 * o erro no lugar errado quando ele estiver errado. A frase nomeia o que vai junto — e some
 * inteira quando não há herança, em vez de dizer “herda nada”.
 */
export function fraseDaHeranca(metadados: MetadadosHerdados | null): string | null {
  if (metadados === null) return null;

  const partes = [metadados.board, metadados.year === null ? null : String(metadados.year)].filter(
    (parte): parte is string => parte !== null && parte !== "",
  );

  if (partes.length === 0) return null;

  return `herda ${partes.join(" · ")} da questão anterior`;
}

/**
 * A mesma pergunta, do lado da tela: de quem o menu vai herdar.
 *
 * A tela não tem `parentId` nem `sortKey` — a árvore chega achatada em ordem de exibição, com
 * `depth`. Então a busca aqui é por índice, e não por posição na árvore.
 *
 * **O servidor é quem decide.** Isto é previsão, e existe porque um menu que só diz “herda da
 * anterior” obriga a fechar o menu e ir conferir qual é a anterior. Se as duas divergirem, quem
 * vale é a questão criada — e é por isso que a frase nomeia os valores em vez de prometer regra.
 */
export function fonteDaAnterior(
  nodes: readonly { readonly depth: number; readonly question: { readonly source: string | null } | null }[],
  selecionado: number | null,
): string | null {
  /*
   * Onde o item novo entra, em índice.
   *
   * Contêiner recebe **dentro**, no fim — então o ponto de inserção fica depois de toda a subárvore
   * dele, e não logo abaixo da linha. Folha recebe ao lado. É a mesma decisão de `placementForAdd`,
   * lida em profundidade em vez de em `parentId`.
   */
  let insercao = nodes.length;

  if (selecionado !== null) {
    const alvo = nodes[selecionado];
    if (alvo === undefined) return null;

    insercao = selecionado + 1;
    while (insercao < nodes.length && (nodes[insercao]?.depth ?? 0) > alvo.depth) insercao += 1;
  }

  for (let i = insercao - 1; i >= 0; i -= 1) {
    const fonte = nodes[i]?.question?.source;
    if (fonte) return fonte;
  }

  return null;
}
