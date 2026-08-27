package br.com.avaliacao.desempenho.indicadores.domain.model;

import java.util.Objects;

/** Resultado da validação estrutural de um pedido de indicador. */
public record IndicatorQueryPlan(
    IndicatorAggregateCriteria aggregateCriteria, boolean requiresInsufficientDataResponse) {

  public IndicatorQueryPlan {
    Objects.requireNonNull(aggregateCriteria, "critérios de agregação não podem ser nulos");
  }
}
