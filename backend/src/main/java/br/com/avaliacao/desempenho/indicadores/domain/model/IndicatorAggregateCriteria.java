package br.com.avaliacao.desempenho.indicadores.domain.model;

import java.util.Objects;
import java.util.UUID;

/** Critérios já validados que uma implementação SQL pode receber. */
public record IndicatorAggregateCriteria(
    UUID cycleId,
    IndicatorMetric metric,
    IndicatorPopulationDimension populationDimension,
    UUID populationId,
    UUID competencyId) {

  public IndicatorAggregateCriteria {
    Objects.requireNonNull(cycleId, "ciclo não pode ser nulo");
    Objects.requireNonNull(metric, "métrica não pode ser nula");
    Objects.requireNonNull(populationDimension, "dimensão populacional não pode ser nula");

    if (populationDimension == IndicatorPopulationDimension.OVERALL && populationId != null) {
      throw new IllegalArgumentException("A população geral não pode possuir identificador.");
    }
    if (populationDimension != IndicatorPopulationDimension.OVERALL && populationId == null) {
      throw new IllegalArgumentException("A dimensão populacional exige identificador.");
    }
    if (metric.requiresCompetency() && competencyId == null) {
      throw new IllegalArgumentException("A métrica por competência exige competência.");
    }
    if (!metric.requiresCompetency() && competencyId != null) {
      throw new IllegalArgumentException(
          "A competência só pode selecionar métrica por competência.");
    }
  }
}
