package br.com.avaliacao.desempenho.indicadores.domain.model;

import java.math.BigDecimal;

/** Linha agregada interna. A população da amostra fica no servidor. */
public record IndicatorDashboardAggregate(
    Kind kind,
    String label,
    int collaborators,
    long total,
    long eligible,
    BigDecimal averageScore,
    Scope scope) {

  public IndicatorDashboardAggregate(
      Kind kind,
      String label,
      int collaborators,
      long total,
      long eligible,
      BigDecimal averageScore) {
    this(kind, label, collaborators, total, eligible, averageScore, Scope.CYCLE);
  }

  public enum Scope {
    CYCLE,
    AREA,
    WEEK,
    CURRENT_MONTH,
    PREVIOUS_MONTH
  }

  public enum Kind {
    COLLABORATORS,
    ASSESSMENTS,
    MANAGERS,
    MANAGER_SELF_ASSESSMENTS,
    AVERAGE,
    FINALIZED,
    FEEDBACK,
    BRANCH,
    ITEM
  }
}
