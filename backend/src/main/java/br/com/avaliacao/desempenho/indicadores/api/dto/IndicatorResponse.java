package br.com.avaliacao.desempenho.indicadores.api.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.Objects;

/** Resposta JSON segura para {@code GET /api/v1/indicators}. */
public sealed interface IndicatorResponse
    permits IndicatorResponse.Available, IndicatorResponse.InsufficientData {

  IndicatorAvailability availability();

  enum IndicatorAvailability {
    AVAILABLE,
    INSUFFICIENT_DATA
  }

  record Available(
      IndicatorAvailability availability,
      String policyVersion,
      IndicatorMetricRequest metric,
      BigDecimal averageScore,
      List<ClassificationPercentageResponse> classificationDistribution)
      implements IndicatorResponse {

    public Available {
      if (availability != IndicatorAvailability.AVAILABLE) {
        throw new IllegalArgumentException("Indicador disponível exige disponibilidade AVAILABLE.");
      }
      requireNotBlank(policyVersion, "versão de política");
      Objects.requireNonNull(metric, "métrica não pode ser nula");
      classificationDistribution = List.copyOf(classificationDistribution);

      if (metric == IndicatorMetricRequest.CLASSIFICATION_DISTRIBUTION) {
        if (averageScore != null || classificationDistribution.isEmpty()) {
          throw new IllegalArgumentException(
              "A distribuição exige percentuais e não aceita média de nota.");
        }
      } else if (averageScore == null || !classificationDistribution.isEmpty()) {
        throw new IllegalArgumentException(
            "Uma métrica de média exige nota e não aceita distribuição.");
      }
    }
  }

  record InsufficientData(IndicatorAvailability availability, String policyVersion)
      implements IndicatorResponse {

    public InsufficientData {
      if (availability != IndicatorAvailability.INSUFFICIENT_DATA) {
        throw new IllegalArgumentException(
            "Indicador suprimido exige disponibilidade INSUFFICIENT_DATA.");
      }
      requireNotBlank(policyVersion, "versão de política");
    }
  }

  record ClassificationPercentageResponse(String classification, BigDecimal percentage) {

    public ClassificationPercentageResponse {
      requireNotBlank(classification, "classificação");
      Objects.requireNonNull(percentage, "percentual não pode ser nulo");
    }
  }

  private static void requireNotBlank(String value, String fieldName) {
    if (value == null || value.isBlank()) {
      throw new IllegalArgumentException(fieldName + " não pode ser vazio");
    }
  }
}
