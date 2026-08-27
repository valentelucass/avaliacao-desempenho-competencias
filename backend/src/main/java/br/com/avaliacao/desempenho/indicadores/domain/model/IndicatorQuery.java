package br.com.avaliacao.desempenho.indicadores.domain.model;

import java.util.Objects;
import java.util.UUID;

/**
 * Pedido de indicador antes da validação de privacidade. Os identificadores são internos e nunca
 * devem ser devolvidos como parte de uma resposta agregada.
 */
public record IndicatorQuery(
    UUID cycleId,
    IndicatorMetric metric,
    UUID branchId,
    UUID areaId,
    UUID managerUserId,
    UUID collaboratorId,
    UUID competencyId) {

  public IndicatorQuery {
    Objects.requireNonNull(cycleId, "ciclo não pode ser nulo");
    Objects.requireNonNull(metric, "métrica não pode ser nula");
  }
}
