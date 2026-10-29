/**
 * O job não tem artefato com este nome — ou o job não existe.
 *
 * A rota de download montava o 404 à mão (ADR 0011); agora ele sai da tabela de `app/api/http.ts`.
 */
export class RenderArtifactNotFoundError extends Error {
  constructor(
    readonly jobId: string,
    readonly artifactName: string,
  ) {
    super(`Artefato \`${artifactName}\` não existe no job ${jobId}.`);
    this.name = "RenderArtifactNotFoundError";
  }
}
