/**
 * O ISBN na forma em que se compara (STM-16 da revisão de 2026-09-23).
 *
 * `978-85-357-0011-4` e `9788535700114` são o mesmo livro, e a ficha catalográfica escreve dos dois
 * jeitos. Comparar sem normalizar deixaria passar a duplicata mais óbvia que existe. O `X` do
 * ISBN-10 é dígito legítimo e sobe para maiúscula.
 *
 * Um lugar só porque a detecção de duplicata do Calibre, a colisão do `.lbb` e a ficha do livro
 * dependem de a normalização ser **idêntica**: uma correção (o prefixo "ISBN", o ISBN-10 contra o
 * 13) que entrasse numa cópia e não na outra faria o mesmo livro colidir num caminho e não no outro.
 */
export function normalizeIsbn(value: string | null | undefined): string | null {
  if (!value) return null;

  const limpo = value.replace(/[\s-]/g, "").toUpperCase();
  return limpo === "" ? null : limpo;
}
