package br.com.avaliacao.desempenho.avaliacoes.domain.model;

import java.util.Collection;
import java.util.Objects;
import java.util.UUID;

/** Fluxo v2024.1 de rascunho, envio, publicação administrativa e reabertura. */
public final class AssessmentLifecycle {

  public void requireDraftEditable(AssessmentStatus currentStatus) {
    requireCurrentStatus(currentStatus, AssessmentStatus.RASCUNHO, "editar");
  }

  public AssessmentStatus submit(
      AssessmentStatus currentStatus,
      AssessmentResponseSet responses,
      Collection<UUID> requiredQuestionIds) {
    requireCurrentStatus(currentStatus, AssessmentStatus.RASCUNHO, "enviar");
    Objects.requireNonNull(responses, "respostas não podem ser nulas")
        .requireCompleteFor(requiredQuestionIds);
    return AssessmentStatus.ENVIADA;
  }

  public AssessmentStatus publish(AssessmentStatus currentStatus) {
    requireCurrentStatus(currentStatus, AssessmentStatus.ENVIADA, "publicar");
    return AssessmentStatus.PUBLICADA;
  }

  public AssessmentStatus reopen(AssessmentStatus currentStatus) {
    requireCurrentStatus(currentStatus, AssessmentStatus.PUBLICADA, "reabrir");
    return AssessmentStatus.RASCUNHO;
  }

  private void requireCurrentStatus(
      AssessmentStatus currentStatus, AssessmentStatus expectedStatus, String requestedAction) {
    AssessmentStatus status = Objects.requireNonNull(currentStatus, "situação não pode ser nula");
    if (status != expectedStatus) {
      throw new AssessmentRuleViolation(
          "Não é permitido " + requestedAction + " uma avaliação na situação " + status + ".");
    }
  }
}
