/**
 * Tags.
 *
 * A decisão inteira deste arquivo é uma: **o mesmo assunto escrito de dois jeitos não pode virar
 * duas tags**. Num acervo alimentado por anos, "Função Quadrática", "função quadratica" e
 * "  Função  Quadrática " seriam três linhas, três filtros e três contagens — e a pessoa
 * concluiria que o filtro por tag não funciona.
 */

export const TAG_KINDS = ["SUBJECT", "TOPIC", "SKILL", "SOURCE", "CURRICULUM", "CUSTOM"] as const;
export type TagKind = (typeof TAG_KINDS)[number];

export const isTagKind = (value: string): value is TagKind =>
  (TAG_KINDS as readonly string[]).includes(value);

/** Acima disso não é tag, é frase. */
export const MAX_TAG_LENGTH = 60;

export class InvalidTagError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTagError";
  }
}

/**
 * O nome **como é mostrado**: espaços colapsados, pontas aparadas, caixa preservada.
 *
 * A caixa fica como a pessoa escreveu porque é ela que aparece na tela e nas listas — "Função
 * Quadrática" é como se escreve em português, e forçar minúscula deixaria o acervo com cara de
 * banco de dados. Quem cuida da duplicata é a chave, abaixo.
 */
export function displayName(raw: string): string {
  const name = raw.replace(/\s+/g, " ").trim();

  if (name === "") throw new InvalidTagError("O nome da tag não pode ser vazio.");
  if (name.length > MAX_TAG_LENGTH) {
    throw new InvalidTagError(`O nome da tag passa de ${MAX_TAG_LENGTH} caracteres.`);
  }
  return name;
}

/**
 * A chave de comparação: sem caixa, sem acento, sem espaço duplicado.
 *
 * É ela que decide se duas tags são a mesma. Tirar o acento é deliberado e tem custo — "sabia" e
 * "sabiá" viram a mesma chave —, mas o ganho é maior: num acervo em português, digitar sem acento
 * é o erro mais comum, e "funcao quadratica" precisa encontrar "Função Quadrática".
 *
 * A escolha vale para **tag**, que é rótulo curto de organização. Não vale para conteúdo de
 * questão, onde acento é significado.
 */
export function tagKey(raw: string): string {
  return displayName(raw)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export const sameTag = (a: string, b: string): boolean => tagKey(a) === tagKey(b);

/**
 * Tira repetidas de uma lista, preservando a **primeira** grafia.
 *
 * A primeira, e não a última: quem digitou primeiro escolheu a forma, e trocá-la a cada nova
 * digitação faria o nome da tag mudar sozinho na tela de todo mundo.
 */
export function dedupeTagNames(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];

  for (const name of names) {
    let key: string;
    try {
      key = tagKey(name);
    } catch {
      // Nome inválido some da lista em vez de derrubar tudo: isto roda sobre entrada colada, e
      // uma vírgula sobrando não deveria custar as outras dezoito tags.
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(displayName(name));
  }

  return kept;
}

/** `"álgebra, funções ,  Álgebra "` → `["álgebra", "funções"]`. */
export const parseTagInput = (input: string): string[] => dedupeTagNames(input.split(","));

export interface TagSuggestion {
  readonly id: string;
  readonly name: string;
  /** Quantas questões usam. É o critério de ordenação. */
  readonly usageCount: number;
}

/**
 * Sugestões para o autocomplete.
 *
 * Ordenadas por **uso**, não por alfabeto. Num acervo de milhares de questões, as dez tags mais
 * usadas cobrem a maioria dos casos, e a ordem alfabética esconderia justamente essas atrás de
 * qualquer coisa que comece com "a".
 *
 * Casa por prefixo **e** por conteúdo, mas prefixo primeiro: quem digita "fun" quer "Função",
 * não "Interpretação de funções".
 */
export function rankSuggestions(
  tags: readonly TagSuggestion[],
  query: string,
  limit = 10,
): TagSuggestion[] {
  const trimmed = query.trim();
  if (trimmed === "") {
    return [...tags].sort((a, b) => b.usageCount - a.usageCount).slice(0, limit);
  }

  const key = tagKey(trimmed);

  return tags
    .flatMap((tag) => {
      const candidate = tagKey(tag.name);
      if (candidate.startsWith(key)) return [{ tag, rank: 0 }];
      if (candidate.includes(key)) return [{ tag, rank: 1 }];
      return [];
    })
    .sort((a, b) => a.rank - b.rank || b.tag.usageCount - a.tag.usageCount)
    .slice(0, limit)
    .map((entry) => entry.tag);
}
