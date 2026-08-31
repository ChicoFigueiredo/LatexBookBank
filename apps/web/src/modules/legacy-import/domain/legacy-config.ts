/**
 * O `padrao.knowchicoconfig` é a fonte da verdade de quais pastas são biblioteca.
 *
 * A alternativa — varrer o filesystem e tratar toda pasta como candidata — erraria duas vezes no
 * próprio acervo: `ITA/` não tem biblioteca nenhuma dentro (só `Material`, apostilas de terceiros),
 * e `_Antigos/` guarda cópias desatualizadas de bibliotecas que já têm versão corrente registrada.
 * Confiar no config faz as duas ficarem de fora sem precisar de caso especial — elas simplesmente
 * não estão na tabela.
 *
 * Ver planejamento §2.10 · checklist Fase 11.
 */

export interface LegacyLibraryRow {
  readonly id: number;
  readonly name: string;
  /** Caminho do Windows como o legado gravou, ex.: `T:\KnowChico\Provas\ENEM`. */
  readonly pathFolder: string;
  readonly metadataFile: string;
  readonly isSelected: boolean;
}

export interface LegacyConfigReader {
  listLibraries(): Promise<readonly LegacyLibraryRow[]>;
}

export interface LegacyFsProbe {
  exists(path: string): Promise<boolean>;
  listTopLevelDirectories(root: string): Promise<readonly string[]>;
}

/**
 * Acha o marcador da raiz do acervo entre os segmentos do caminho e devolve o resto, em POSIX.
 *
 * Não é substituição de string: `T:\KnowChico\Cálculo` e `T:/KnowChico/Cálculo` devem dar o mesmo
 * resultado, e um marcador que aparecesse dentro do nome de outra pasta (`KnowChicoAntigo`) não
 * pode casar por acidente — daí comparar segmento a segmento, não substring.
 */
export function relativeAcervoPath(windowsPath: string, rootMarker: string): string | null {
  const segments = windowsPath.split(/[\\/]+/).filter((segment) => segment.length > 0);
  const markerIndex = segments.findIndex(
    (segment) => segment.toLowerCase() === rootMarker.toLowerCase(),
  );
  if (markerIndex === -1) return null;

  const rest = segments.slice(markerIndex + 1);
  if (rest.length === 0) return null;

  return rest.join("/");
}
