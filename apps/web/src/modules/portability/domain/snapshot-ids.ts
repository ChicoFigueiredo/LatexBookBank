/**
 * Traduz os ids que um snapshot de revisão guarda dentro do JSON.
 *
 * O snapshot de uma questão leva o id de cada alternativa (`options[].id`), e é por ele que
 * "desfazer" sabe qual alternativa voltar ao texto antigo. Exportado como estava, o snapshot
 * apontaria para alternativas do banco de origem, e desfazer depois do restore não acharia nenhuma.
 *
 * Só se traduz o que está numa chave de id — `id`, `…Id` ou `…Ids` —, e só o id que o mapa conhece.
 * Um texto que por acaso fosse igual a uma `ref` (`"q-3"` num enunciado) continua intacto, e um id
 * que o mapa não conhece (alternativa já excluída na origem) fica como estava: não aponta para nada
 * lá, e continua não apontando aqui.
 *
 * O texto só é reescrito quando algo muda: um snapshot sem id sai byte a byte igual.
 */
export function translateSnapshotIds(
  snapshotJson: string,
  translate: (id: string) => string | undefined,
): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(snapshotJson);
  } catch {
    return snapshotJson;
  }

  let changed = false;
  const one = (value: unknown): unknown => {
    if (typeof value !== "string") return value;
    const next = translate(value);
    if (next === undefined || next === value) return value;
    changed = true;
    return next;
  };

  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk);
    if (typeof value !== "object" || value === null) return value;

    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => {
        if (key === "id" || key.endsWith("Id")) return [key, one(inner)];
        if (key.endsWith("Ids") && Array.isArray(inner)) return [key, inner.map(one)];
        return [key, walk(inner)];
      }),
    );
  };

  const translated = walk(parsed);
  return changed ? JSON.stringify(translated) : snapshotJson;
}
