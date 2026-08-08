import type { RenderJobStatus, RenderResult } from "@latexbookbank/render-contract";

/**
 * Os jobs, em memória.
 *
 * **De propósito.** O worker não tem banco, e não ter é a propriedade que a auditoria pediu: sem
 * banco não há credencial de banco, e sem credencial não há o que vazar. A consequência aceita é
 * que reiniciar o worker perde os jobs em voo — e é aceitável porque render é **reconstruível**
 * (D29, auditoria §41). Quem perde um job pede de novo; quem perde uma questão perde patrimônio,
 * e por isso questão vive no banco e render não.
 *
 * A aplicação é quem persiste o `RenderJob` e os artefatos. Aqui é só o que está acontecendo agora.
 */

interface JobEntry {
  status: RenderJobStatus;
  artifacts: ReadonlyMap<string, Buffer>;
  /** Momento em que entrou em estado final; usado pela expiração. */
  finishedAt: number | null;
}

/**
 * Quanto tempo um job concluído fica disponível para download.
 *
 * Os artefatos vivem em memória, então isto é um teto de RAM disfarçado de política. Dez minutos
 * cobre com folga o intervalo entre o worker terminar e a aplicação baixar; acima disso, o job
 * que ninguém buscou provavelmente não vai ser buscado.
 */
export const JOB_TTL_MS = 10 * 60 * 1000;

export class JobStore {
  private readonly jobs = new Map<string, JobEntry>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  enqueue(jobId: string): void {
    this.jobs.set(jobId, {
      status: { jobId, state: "queued", result: null },
      artifacts: new Map(),
      finishedAt: null,
    });
  }

  /**
   * Marca como em execução, ou diz que não deve começar.
   *
   * Devolve `false` quando o job foi cancelado enquanto esperava. É aqui que "render pendente é
   * cancelado quando ainda não iniciou" vira código: quem cancela só muda o estado, e é este
   * ponto que decide não gastar um `pdflatex` com o que ninguém mais quer.
   */
  start(jobId: string): boolean {
    const entry = this.jobs.get(jobId);
    if (entry === undefined || entry.status.state !== "queued") return false;

    entry.status = { jobId, state: "running", result: null };
    return true;
  }

  complete(jobId: string, result: RenderResult, artifacts: ReadonlyMap<string, Buffer>): void {
    const entry = this.jobs.get(jobId);
    if (entry === undefined) return;

    entry.status = { jobId, state: result.success ? "done" : "failed", result };
    entry.artifacts = artifacts;
    entry.finishedAt = this.now();
  }

  /**
   * Cancela, se ainda dá.
   *
   * Job que já terminou não volta a ser cancelado — o resultado existe, e apagá-lo faria a
   * aplicação perder um artefato que ela talvez já tenha começado a baixar.
   */
  cancel(jobId: string): boolean {
    const entry = this.jobs.get(jobId);
    if (entry === undefined) return false;
    if (entry.status.state !== "queued" && entry.status.state !== "running") return false;

    entry.status = { jobId, state: "cancelled", result: null };
    entry.artifacts = new Map();
    entry.finishedAt = this.now();
    return true;
  }

  status(jobId: string): RenderJobStatus | null {
    this.expire();
    return this.jobs.get(jobId)?.status ?? null;
  }

  artifact(jobId: string, name: string): Buffer | null {
    this.expire();
    return this.jobs.get(jobId)?.artifacts.get(name) ?? null;
  }

  /**
   * Varre os concluídos vencidos.
   *
   * Roda a cada consulta em vez de num temporizador: um `setInterval` manteria o processo vivo e
   * precisaria ser desligado no encerramento, e a varredura custa nada num mapa que, por
   * construção, tem poucas dezenas de entradas.
   */
  private expire(): void {
    const cutoff = this.now() - JOB_TTL_MS;
    for (const [jobId, entry] of this.jobs) {
      if (entry.finishedAt !== null && entry.finishedAt < cutoff) this.jobs.delete(jobId);
    }
  }

  get size(): number {
    return this.jobs.size;
  }
}
