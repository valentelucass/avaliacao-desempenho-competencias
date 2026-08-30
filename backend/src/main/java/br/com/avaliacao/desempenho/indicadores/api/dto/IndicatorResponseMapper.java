package br.com.avaliacao.desempenho.indicadores.api.dto;

import br.com.avaliacao.desempenho.indicadores.domain.model.ClassificationPercentage;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorResult;
import java.util.List;
import java.util.Objects;

/** Converte o resultado de domínio em DTO sem incluir contagem ou identificadores individuais. */
public final class IndicatorResponseMapper {

  public static final String POLICY_VERSION = "2024.1";

  public IndicatorResponse toResponse(IndicatorResult result) {
    IndicatorResult safeResult = Objects.requireNonNull(result, "resultado não pode ser nulo");
    if (safeResult instanceof IndicatorResult.InsufficientData) {
      return new IndicatorResponse.InsufficientData(
          IndicatorResponse.IndicatorAvailability.INSUFFICIENT_DATA, POLICY_VERSION);
    }

    IndicatorResult.Available available = (IndicatorResult.Available) safeResult;
    List<IndicatorResponse.ClassificationPercentageResponse> distribution =
        available.classificationDistribution().stream().map(this::toDistributionResponse).toList();
    return new IndicatorResponse.Available(
        IndicatorResponse.IndicatorAvailability.AVAILABLE,
        POLICY_VERSION,
        IndicatorMetricRequest.valueOf(available.metric().name()),
        available.averageScore(),
        distribution);
  }

  private IndicatorResponse.ClassificationPercentageResponse toDistributionResponse(
      ClassificationPercentage percentage) {
    return new IndicatorResponse.ClassificationPercentageResponse(
        percentage.classification().name(), percentage.percentage());
  }
}
