package br.com.avaliacao.desempenho.ciclosavaliacao.domain.model;

/** Escopo de consulta já decidido pela política; o repositório ainda aplica o vínculo no SQL. */
public record EvaluationCycleReadScope(
    boolean allCycles,
    boolean managedCollaborators,
    boolean directorManagedCollaborators,
    boolean ownCollaborator) {

  public EvaluationCycleReadScope {
    if (!allCycles && !managedCollaborators && !directorManagedCollaborators && !ownCollaborator) {
      throw new IllegalArgumentException("O escopo de leitura de ciclos não pode ser vazio.");
    }
  }
}
