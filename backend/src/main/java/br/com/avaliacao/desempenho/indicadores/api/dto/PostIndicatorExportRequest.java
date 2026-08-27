package br.com.avaliacao.desempenho.indicadores.api.dto;

import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorQuery;
import jakarta.validation.constraints.NotNull;
import java.util.Objects;
import java.util.UUID;

/**
 * Contrato JSON de {@code POST /api/v1/indicators/exports}. Os filtros são idênticos aos da
 * consulta e a exportação só pode conter o mesmo agregado liberado pela política de privacidade.
 */
public record PostIndicatorExportRequest(
    @NotNull UUID cycleId,
    @NotNull IndicatorMetricRequest metric,
    UUID branchId,
    UUID areaId,
    UUID managerUserId,
    UUID collaboratorId,
    UUID competencyId) {

  public IndicatorQuery toDomainQuery() {
    return new IndicatorQuery(
        cycleId,
        Objects.requireNonNull(metric, "métrica não pode ser nula").toDomainMetric(),
        branchId,
        areaId,
        managerUserId,
        collaboratorId,
        competencyId);
  }
}
