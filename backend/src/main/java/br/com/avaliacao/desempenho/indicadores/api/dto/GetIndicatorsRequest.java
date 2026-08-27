package br.com.avaliacao.desempenho.indicadores.api.dto;

import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorQuery;
import jakarta.validation.constraints.NotNull;
import java.util.Objects;
import java.util.UUID;

/**
 * Contrato de parâmetros de {@code GET /api/v1/indicators}.
 *
 * <p>{@code cycleId} e {@code metric} são obrigatórios. Apenas um entre {@code branchId}, {@code
 * areaId} e {@code managerUserId} pode ser informado. {@code collaboratorId} resulta somente em
 * dados insuficientes, sem agregar ou expor valores.
 */
public record GetIndicatorsRequest(
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
