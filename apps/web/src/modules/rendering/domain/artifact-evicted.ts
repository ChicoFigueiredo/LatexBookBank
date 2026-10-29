/**
 * O artefato do job tem linha no banco e não tem arquivo no storage.
 *
 * Derivado pode ser descartado (D29), então é estado legítimo — e a mensagem diz o que fazer, o
 * que o "arquivo não está mais no storage" genérico não diz.
 */
export class ArtifactEvictedError extends Error {
  constructor() {
    super("O artefato foi descartado do storage. Recompile para gerá-lo de novo.");
    this.name = "ArtifactEvictedError";
  }
}
