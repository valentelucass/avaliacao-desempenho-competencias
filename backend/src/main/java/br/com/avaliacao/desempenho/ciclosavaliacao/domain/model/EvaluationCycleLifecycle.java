package br.com.avaliacao.desempenho.ciclosavaliacao.domain.model;

import java.util.Objects;

/** Fluxo mínimo aceito para ciclos: rascunho, abertura e encerramento. */
public final class EvaluationCycleLifecycle {

  public EvaluationCycleStatus open(EvaluationCycleStatus currentStatus) {
    requireCurrentStatus(currentStatus, EvaluationCycleStatus.RASCUNHO, "abrir");
    return EvaluationCycleStatus.ABERTO;
  }

  public EvaluationCycleStatus close(EvaluationCycleStatus currentStatus) {
    requireCurrentStatus(currentStatus, EvaluationCycleStatus.ABERTO, "encerrar");
    return EvaluationCycleStatus.ENCERRADO;
  }

  private void requireCurrentStatus(
      EvaluationCycleStatus currentStatus,
      EvaluationCycleStatus expectedStatus,
      String requestedAction) {
    EvaluationCycleStatus status =
        Objects.requireNonNull(currentStatus, "situação não pode ser nula");
    if (status != expectedStatus) {
      throw new CycleRuleViolation(
          "Não é permitido " + requestedAction + " um ciclo na situação " + status + ".");
    }
  }
}
