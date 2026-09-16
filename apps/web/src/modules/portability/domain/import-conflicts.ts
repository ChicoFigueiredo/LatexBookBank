import type { ImportCollision } from "../application/import-workspace";

/**
 * De colisões de chave para conflitos que uma pessoa lê.
 *
 * `toRuntime` empurra **uma colisão por chave que bateu**: uma publicação que casa por `legacyId`
 * *e* por `legacyUuid` produz duas. Isso é correto para o domínio — as duas chaves bateram — e é
 * mentira na tela: "2 conflitos" para um livro só faz o usuário procurar o segundo livro que não
 * existe. O número que ele precisa é de **coisas**, não de chaves.
 *
 * O protótipo (1829–1888) escreve a frase inteira:
 *
 *   “FME 1” já existe com 148 questões — o arquivo traz 152. Nada será sobrescrito sem sua escolha.
 *
 * Três fatos e uma garantia, e nenhum deles é decorativo: o nome identifica, os dois números dizem
 * que não são o mesmo livro parado no tempo, e a garantia é o que permite clicar em "Importar"
 * sem medo. "2 item(ns) já existem no acervo" — o que a tela dizia — não tem nenhum dos três.
 */

export interface ConflitoDeImportacao {
  readonly kind: "publication" | "question";
  /** Como o item se chama no acervo — é por ele que a pessoa reconhece o que está em jogo. */
  readonly title: string;
  /** Quantas questões o item **já tem** aqui. `null` quando a contagem não se aplica. */
  readonly existingQuestions: number | null;
  /** Quantas o arquivo traz. `null` quando não se sabe. */
  readonly incomingQuestions: number | null;
  readonly existingId: string;
}

/**
 * Uma linha por item, e não por chave.
 *
 * A deduplicação é por `existingId`: é o item do destino que está em jogo, e duas chaves apontando
 * para ele são o mesmo conflito visto de dois ângulos.
 */
export function deduplicarColisoes(
  colisoes: readonly ImportCollision[],
): readonly ImportCollision[] {
  const vistos = new Set<string>();
  const unicas: ImportCollision[] = [];

  for (const colisao of colisoes) {
    const chave = `${colisao.kind}:${colisao.existingId}`;
    if (vistos.has(chave)) continue;

    vistos.add(chave);
    unicas.push(colisao);
  }

  return unicas;
}

/**
 * A frase do protótipo, com o que se sabe.
 *
 * Sem as contagens ela encolhe em vez de inventar: "“FME 1” já existe no acervo." continua sendo
 * verdade e continua identificando. O que ela nunca faz é somir com a garantia — é a garantia que
 * transforma o aviso em algo sobre o que se pode decidir.
 */
export function fraseDoConflito(conflito: ConflitoDeImportacao): string {
  const nome = `“${conflito.title}”`;

  if (conflito.kind === "question") {
    return `${nome} já existe no acervo. A questão do arquivo entra como cópia.`;
  }

  const { existingQuestions: aqui, incomingQuestions: vem } = conflito;

  if (aqui === null || vem === null) {
    return `${nome} já existe no acervo. Nada será sobrescrito sem sua escolha.`;
  }

  return (
    `${nome} já existe com ${plural(aqui, "questão", "questões")} — ` +
    `o arquivo traz ${vem}. Nada será sobrescrito sem sua escolha.`
  );
}

/**
 * "3 bibliotecas · 64 publicações · 1.247 questões" — os números do cabeçalho, com separador de
 * milhar em pt-BR, porque `1247` num painel de decisão se lê errado na primeira olhada.
 */
export const numero = (valor: number): string => new Intl.NumberFormat("pt-BR").format(valor);

const plural = (n: number, um: string, muitos: string): string =>
  `${numero(n)} ${n === 1 ? um : muitos}`;
