package br.com.avaliacao.desempenho.avaliacoes.application;

import java.util.UUID;

/** Recurso ausente ou fora do escopo, sem revelar qual condição ocorreu. */
public final class AssessmentNotFoundException extends RuntimeException {

  public AssessmentNotFoundException(UUID assessmentId) {
    super("Assessment not found: " + assessmentId);
  }
}
