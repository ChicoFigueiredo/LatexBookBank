import type { NormalizedBox } from "./source-anchor";

/**
 * A cadeia de proveniência de uma questão: fonte → página → recorte.
 *
 * DTO do domínio, e não a linha do Prisma: quem lê isto é a tela, e a tela nunca deve ver
 * `xNormalized` nem `storageKey`. A chave de storage em especial fica no servidor — devolvê-la
 * contaria como o storage organiza os arquivos e amarraria o browser a um detalhe que muda
 * quando o provider mudar (D26).
 *
 * Ver spec §18 · D28 · D29 · issue #137.
 */

export interface ProvenanceSource {
  readonly assetId: string;
  readonly filename: string | null;
  readonly mimeType: string;
  /** `true` quando dá para abrir a página no visualizador. Imagem solta não tem página. */
  readonly isPdf: boolean;
}

export interface Provenance {
  readonly anchorId: string;
  readonly publicationId: string;
  readonly pageNumber: number;
  readonly box: NormalizedBox;
  readonly rotation: number | null;
  readonly source: ProvenanceSource;
  /** O `Asset(CROP)`, quando existe. Ele é derivado — pode ter sido descartado (D29). */
  readonly cropAssetId: string | null;
  readonly sourceText: string | null;
  readonly extractionMethod: string | null;
  readonly extractionModel: string | null;
}

/**
 * Porta de leitura da proveniência.
 *
 * Só leitura, de propósito: a âncora nasce no recorte e não é editada depois. Uma questão que
 * veio de outro lugar recebe **outra** âncora, e a anterior continua lá — reescrever a origem
 * apagaria justamente a coisa que a proveniência existe para responder.
 */
export interface ProvenanceReader {
  findByQuestionId(questionId: string): Promise<Provenance | null>;
}

/**
 * O que dá para fazer a partir de uma origem.
 *
 * Sai do domínio porque cada opção **depende do que a fonte é**: abrir na página só faz sentido
 * num PDF, e reconhecer de novo só faz sentido se o recorte ainda existe. Deixar isso na tela
 * daria botões que falham quando clicados.
 */
export interface OriginAction {
  readonly id: "open-source" | "recognize-math" | "insert-figure" | "copy-reference";
  readonly label: string;
  readonly available: boolean;
  /** Por que não dá, quando não dá. Botão desabilitado sem motivo é enigma. */
  readonly unavailableReason: string | null;
}

export function originActions(provenance: Provenance): readonly OriginAction[] {
  const crop = provenance.cropAssetId !== null;

  return [
    {
      id: "open-source",
      label: "Abrir na fonte",
      available: provenance.source.isPdf,
      unavailableReason: provenance.source.isPdf
        ? null
        : "A fonte é uma imagem solta — não há página para abrir.",
    },
    {
      id: "recognize-math",
      label: "Reconhecer matemática",
      available: crop,
      unavailableReason: crop ? null : "O recorte foi descartado do storage.",
    },
    {
      id: "insert-figure",
      label: "Inserir como figura",
      available: crop,
      unavailableReason: crop ? null : "O recorte foi descartado do storage.",
    },
    {
      id: "copy-reference",
      // Sempre disponível: a âncora **é** a referência, e ela sobrevive ao descarte do derivado.
      label: "Copiar referência",
      available: true,
      unavailableReason: null,
    },
  ];
}

/**
 * A referência textual da origem, para colar num comentário ou numa mensagem.
 *
 * Formato estável e sem id de banco: quem recebe precisa achar o mesmo pedaço do mesmo arquivo,
 * e um uuid não ajuda ninguém a fazer isso.
 */
export function referenceText(provenance: Provenance): string {
  const percent = (value: number): string => `${(value * 100).toFixed(1)}%`;
  const { box } = provenance;

  return (
    `${provenance.source.filename ?? "fonte desconhecida"}, p. ${provenance.pageNumber}, ` +
    `recorte ${percent(box.x)},${percent(box.y)} ${percent(box.width)}×${percent(box.height)}`
  );
}
