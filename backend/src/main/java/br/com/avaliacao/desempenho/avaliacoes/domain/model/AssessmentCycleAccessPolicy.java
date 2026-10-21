package br.com.avaliacao.desempenho.avaliacoes.domain.model;

import br.com.avaliacao.desempenho.ciclosavaliacao.domain.model.EvaluationCycleWindowStatus;
import java.time.Instant;
import java.util.Objects;

/** Regras temporais para contribuições e decisões administrativas de avaliação. */
public final class AssessmentCycleAccessPolicy {

  public boolean permitsRegularContribution(
      CycleState cycleState, Instant openingAt, Instant closingAt, Instant now) {
    Objects.requireNonNull(cycleState, "estado do ciclo não pode ser nulo");
    Objects.requireNonNull(now, "horário atual não pode ser nulo");
    return cycleState == CycleState.OPEN
        && EvaluationCycleWindowStatus.at(openingAt, closingAt, now)
            == EvaluationCycleWindowStatus.VIGENTE;
  }

  /**
   * A reabertura de RH/Diretoria é a exceção registrada que permite ao gestor corrigir e reenviar
   * uma avaliação depois do encerramento, sem reabrir o ciclo inteiro.
   */
  public boolean permitsPostClosingReopenedContribution(
      CycleState cycleState,
      AssessmentType assessmentType,
      AssessmentStatus assessmentStatus,
      boolean hasAdministrativeReopen) {
    return cycleState == CycleState.CLOSED
        && (assessmentType == AssessmentType.GESTOR
            || assessmentType == AssessmentType.DIRETORIA_GERENCIA)
        && assessmentStatus == AssessmentStatus.RASCUNHO
        && hasAdministrativeReopen;
  }

  /** RH/Diretoria podem publicar envios pendentes ou reabrir depois do encerramento. */
  public boolean permitsAdministrativeDecision(CycleState cycleState) {
    return cycleState == CycleState.OPEN || cycleState == CycleState.CLOSED;
  }

  public enum CycleState {
    DRAFT,
    OPEN,
    CLOSED,
    OTHER
  }
}
