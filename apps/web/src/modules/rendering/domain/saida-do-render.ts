/**
 * O que entra no render: a saída de aluno e a saída de professor.
 *
 * O protótipo (1064–1091) põe duas pílulas no cabeçalho do painel — `Aluno` e `Professor` — e uma
 * frase no rodapé do menu de saída: *“a saída vale para o PNG, para o PDF e para a exportação do
 * capítulo — mudar aqui invalida o PDF já gerado.”*
 *
 * O app **sabia compilar as duas**. `includeSolution` atravessa a rota, o bundle e todos os plugins
 * de tipo; `multiple-choice.ts` monta `\textbf{Gabarito:}` e `\textbf{Resolução.}` a partir dele. E
 * o editor nunca pedia: `useRender` mandava `{}` no corpo, então o valor era sempre `false`.
 *
 * O efeito é o pior tipo de silêncio deste dossiê. Quem escreve a resolução na aba `Resposta` e
 * compila recebe um PDF **sem ela** — e nada na tela diz que existe outra saída. A pessoa conclui
 * que o produto não sabe imprimir resolução, e o produto sabia o tempo todo.
 *
 * A segunda metade é de segurança, e é a razão de este módulo existir em vez de um booleano solto:
 * o resultado exibido precisa carregar **sob qual saída foi compilado**. Sem isso, trocar para
 * `Professor` e baixar o PDF que já estava na tela entrega o arquivo de aluno com o nome errado na
 * cabeça de quem baixou — um gabarito que não está lá, numa prova que vai para a mão do aluno.
 */

export type SaidaDoRender = "aluno" | "professor";

export interface SaidaDescrita {
  readonly id: SaidaDoRender;
  readonly label: string;
  /** O `title` da pílula — o que muda no papel, não o nome do público. */
  readonly hint: string;
}

export const SAIDAS: readonly SaidaDescrita[] = [
  { id: "aluno", label: "Aluno", hint: "Só enunciado e alternativas" },
  {
    id: "professor",
    label: "Professor",
    hint: "Enunciado, alternativas, gabarito e resolução",
  },
];

/** O que a rota recebe. Uma função, e não `saida === "professor"` espalhado por três arquivos. */
export const incluiResolucao = (saida: SaidaDoRender): boolean => saida === "professor";

/**
 * A linha em mono ao lado das pílulas (`outSummary` no protótipo).
 *
 * Diz o que entra, e não para quem serve: “gabarito e resolução” é conferível olhando o papel;
 * “versão do professor” é um rótulo em que se acredita.
 */
export function resumoDaSaida(saida: SaidaDoRender): string {
  return saida === "professor"
    ? "enunciado · alternativas · gabarito · resolução"
    : "enunciado · alternativas";
}

/**
 * Por que o resultado na tela não vale para a saída escolhida agora.
 *
 * `null` quando vale — e aí nada aparece. Um aviso permanente vira moldura, e moldura não é lida
 * no dia em que importa.
 */
export function avisoDeSaidaVencida(
  saidaAtual: SaidaDoRender,
  saidaDoResultado: SaidaDoRender | null,
): string | null {
  if (saidaDoResultado === null || saidaDoResultado === saidaAtual) return null;

  const compilada = SAIDAS.find((saida) => saida.id === saidaDoResultado)?.label ?? saidaDoResultado;
  const pedida = SAIDAS.find((saida) => saida.id === saidaAtual)?.label ?? saidaAtual;

  return `Este resultado foi compilado na saída ${compilada}, e a escolhida agora é ${pedida}. Compile de novo antes de baixar.`;
}

/**
 * O nome do arquivo baixado carrega a saída — `q27-professor.pdf`, como no protótipo (1157).
 *
 * Dois PDFs da mesma questão na pasta de downloads, com o mesmo nome, são indistinguíveis no
 * momento em que a diferença importa: um tem o gabarito e o outro não.
 */
export function nomeDoArquivo(
  questaoId: string,
  saida: SaidaDoRender,
  extensao: "pdf" | "png",
): string {
  // Só o começo do id: o nome é para a pessoa reconhecer o arquivo, não para o sistema resolver.
  return `questao-${questaoId.slice(0, 8)}-${saida}.${extensao}`;
}
