/**
 * A fila de captura (§26) — **derivada, não guardada**.
 *
 * O que a §26 pede é "persistir o suficiente para não perder trabalho" e "não criar
 * infraestrutura distribuída desnecessária". As duas coisas ao mesmo tempo saem de uma observação:
 * **o recorte já é durável**. Cada crop salvo é um `Asset` e um `SourceAnchor`, gravados antes do
 * reconhecimento acontecer.
 *
 * Então a fila não precisa de tabela própria. Ela é uma pergunta sobre o que já existe:
 *
 * > quais recortes desta publicação ainda não viraram questão?
 *
 * Uma tabela `CaptureQueueItem` seria um segundo lugar dizendo o que a âncora já diz — e o dia em
 * que os dois discordassem, o recorte estaria na fila sem existir, ou existiria fora da fila.
 *
 * O que a fila **não** guarda é o `recognizing`: ele dura segundos e vive no cliente. Persistir um
 * estado transitório traria o problema que ele resolve — uma linha travada em "reconhecendo" para
 * sempre porque o servidor caiu no meio.
 */

export const QUEUE_STATES = ["queued", "review", "error", "approved"] as const;
export type QueueState = (typeof QUEUE_STATES)[number];

export const QUEUE_LABELS: Readonly<Record<QueueState, string>> = {
  queued: "aguardando",
  review: "revisar",
  error: "erro",
  approved: "aprovado",
};

/** O que a infraestrutura sabe sobre um recorte. Nada aqui é decisão. */
export interface CaptureFacts {
  readonly anchorId: string;
  readonly cropAssetId: string | null;
  readonly pageNumber: number;
  readonly createdAt: Date;
  /** O LaTeX que o reconhecedor devolveu, quando devolveu. */
  readonly recognizedText: string | null;
  /** `recognition:<provider>` quando houve execução; `recognition:failed` quando ela falhou. */
  readonly extractionMethod: string | null;
  readonly extractionModel: string | null;
  /** `true` quando já existe questão ligada a esta âncora. */
  readonly hasQuestion: boolean;
}

export interface CaptureQueueItem extends CaptureFacts {
  readonly state: QueueState;
}

export const FAILED_METHOD = "recognition:failed";

/**
 * O estado de um item, a partir dos fatos.
 *
 * A ordem das perguntas é a ordem do fluxo, e cada uma tem um porquê:
 *
 * 1. **questão ligada → aprovado.** É o único estado terminal, e ele sai da fila.
 * 2. **falha registrada → erro.** Vem antes de "tem texto?" porque uma falha pode ter deixado
 *    texto parcial, e um item com erro precisa aparecer como erro.
 * 3. **tem texto → revisar.** O reconhecimento aconteceu e ninguém conferiu ainda.
 * 4. o resto **aguarda**: recorte salvo, reconhecimento não rodou.
 */
export function stateOf(facts: CaptureFacts): QueueState {
  if (facts.hasQuestion) return "approved";
  if (facts.extractionMethod === FAILED_METHOD) return "error";
  if (facts.recognizedText !== null && facts.recognizedText.trim() !== "") return "review";
  return "queued";
}

export const toQueueItem = (facts: CaptureFacts): CaptureQueueItem => ({
  ...facts,
  state: stateOf(facts),
});

/**
 * A fila que a tela mostra: **o que ainda dá trabalho**, mais recente primeiro.
 *
 * Aprovado sai. Não é esconder histórico — a questão criada é o registro, e a origem dela aponta
 * para este mesmo recorte. Manter o aprovado numa lista de pendências faria a lista crescer para
 * sempre e deixar de ser lista de pendências.
 */
export function pendingQueue(facts: readonly CaptureFacts[]): readonly CaptureQueueItem[] {
  return facts
    .map(toQueueItem)
    .filter((item) => item.state !== "approved")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** Quantos itens em cada estado — o número que o rail mostra ao lado de "Captura". */
export function countByState(
  items: readonly CaptureQueueItem[],
): Readonly<Record<QueueState, number>> {
  const contagem: Record<QueueState, number> = { queued: 0, review: 0, error: 0, approved: 0 };
  for (const item of items) contagem[item.state] += 1;
  return contagem;
}
