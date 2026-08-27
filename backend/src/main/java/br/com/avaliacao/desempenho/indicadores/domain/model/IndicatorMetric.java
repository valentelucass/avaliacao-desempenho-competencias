package br.com.avaliacao.desempenho.indicadores.domain.model;

/** Métricas agregadas permitidas pela regra operacional 2024.1. */
public enum IndicatorMetric {
  FINAL_SCORE_AVERAGE(false),
  COMPETENCY_SCORE_AVERAGE(true),
  CLASSIFICATION_DISTRIBUTION(false);

  private final boolean requiresCompetency;

  IndicatorMetric(boolean requiresCompetency) {
    this.requiresCompetency = requiresCompetency;
  }

  public boolean requiresCompetency() {
    return requiresCompetency;
  }
}
