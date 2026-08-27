package br.com.avaliacao.desempenho.indicadores.api.dto;

import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorMetric;

/** Valores aceitos pelo contrato HTTP para selecionar uma métrica agregada. */
public enum IndicatorMetricRequest {
  FINAL_SCORE_AVERAGE,
  COMPETENCY_SCORE_AVERAGE,
  CLASSIFICATION_DISTRIBUTION;

  public IndicatorMetric toDomainMetric() {
    return IndicatorMetric.valueOf(name());
  }
}
