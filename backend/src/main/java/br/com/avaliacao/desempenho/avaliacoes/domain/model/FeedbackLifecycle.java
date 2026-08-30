package br.com.avaliacao.desempenho.avaliacoes.domain.model;

import java.util.Objects;

/** Regras puras da dimensão de feedback que começa depois da publicação. */
public final class FeedbackLifecycle {

  public FeedbackStatus statusAtPublication(AssessmentType type) {
    return Objects.requireNonNull(type, "tipo não pode ser nulo") == AssessmentType.AUTOAVALIACAO
        ? FeedbackStatus.NAO_APLICAVEL
        : FeedbackStatus.PENDENTE;
  }

  public FeedbackStatus complete(AssessmentStatus assessmentStatus, FeedbackStatus feedbackStatus) {
    if (Objects.requireNonNull(assessmentStatus, "situação não pode ser nula")
        != AssessmentStatus.PUBLICADA) {
      throw new AssessmentRuleViolation("O feedback exige avaliação publicada.");
    }
    if (Objects.requireNonNull(feedbackStatus, "situação de feedback não pode ser nula")
        != FeedbackStatus.PENDENTE) {
      throw new AssessmentRuleViolation("O feedback não pode ser concluído no estado atual.");
    }
    return FeedbackStatus.CONCLUIDO;
  }
}
