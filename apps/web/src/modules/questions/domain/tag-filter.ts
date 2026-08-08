import { tagKey } from "./tag";

/**
 * O predicado de filtro por tag.
 *
 * O `filterTree` já aceita predicado arbitrário desde a Fase 2 — este arquivo só fornece um. Foi
 * a decisão de deixar o filtro genérico lá atrás que fez o filtro por tag caber em vinte linhas
 * em vez de mexer na árvore.
 */

/**
 * Casa quando a questão tem **todas** as tags selecionadas.
 *
 * Todas, e não qualquer uma: selecionar duas tags é o gesto de **estreitar** a busca. Com "ou", a
 * segunda tag ampliaria o resultado, que é o contrário do que a pessoa acabou de pedir — e ela
 * concluiria que o filtro está quebrado.
 *
 * A comparação usa a chave de tag: quem filtra por "funcao" encontra questão marcada com
 * "Função", pelo mesmo motivo que o autocomplete encontra.
 */
export function matchesAllTags(
  questionTags: readonly string[],
  selected: readonly string[],
): boolean {
  if (selected.length === 0) return true;

  const have = new Set(questionTags.map(safeKey).filter((key) => key !== null));
  return selected.every((name) => {
    const key = safeKey(name);
    return key !== null && have.has(key);
  });
}

/** Nome inválido não derruba o filtro — some da comparação. */
function safeKey(name: string): string | null {
  try {
    return tagKey(name);
  } catch {
    return null;
  }
}

/**
 * Quantas questões cada tag tem, para a tela mostrar ao lado do nome.
 *
 * A contagem é do **conjunto visível**, não do acervo inteiro: o número serve para decidir se
 * vale clicar naquela tag agora, e um total global diria "300" numa publicação onde só três
 * questões têm a tag.
 */
export function countTags(
  questions: readonly { readonly tags: readonly string[] }[],
): { readonly name: string; readonly count: number }[] {
  const counts = new Map<string, { name: string; count: number }>();

  for (const question of questions) {
    // Um `Set` por questão: a mesma tag aplicada duas vezes na mesma questão — que o banco
    // impede, mas um import pode produzir — contaria dobrado.
    for (const key of new Set(question.tags.map(safeKey).filter((k) => k !== null))) {
      const first = question.tags.find((name) => safeKey(name) === key) ?? key;
      const entry = counts.get(key) ?? { name: first, count: 0 };
      entry.count += 1;
      counts.set(key, entry);
    }
  }

  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name, "pt"),
  );
}
