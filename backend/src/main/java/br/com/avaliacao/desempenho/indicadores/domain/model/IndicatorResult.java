package br.com.avaliacao.desempenho.indicadores.domain.model;

import java.math.BigDecimal;
import java.util.List;
import java.util.Objects;

/** Resultado seguro pronto para a aplicação converter em resposta HTTP ou exportação. */
public sealed interface IndicatorResult
    permits IndicatorResult.Available, IndicatorResult.InsufficientData {

  GroupedIndicatorAvailability availability();

  record Available(
      IndicatorMetric metric,
      BigDecimal averageScore,
      List<ClassificationPercentage> classificationDistribution)
      implements IndicatorResult {

    public Available {
      Objects.requireNonNull(metric, "métrica não pode ser nula");
      classificationDistribution = List.copyOf(classificationDistribution);

      if (metric == IndicatorMetric.CLASSIFICATION_DISTRIBUTION) {
        if (averageScore != null || classificationDistribution.isEmpty()) {
          throw new IllegalArgumentException(
              "A distribuição exige percentuais e não aceita média de nota.");
        }
      } else if (averageScore == null || !classificationDistribution.isEmpty()) {
        throw new IllegalArgumentException(
            "Uma métrica de média exige nota e não aceita distribuição.");
      }
    }

    @Override
    public GroupedIndicatorAvailability availability() {
      return GroupedIndicatorAvailability.AVAILABLE;
    }
  }

  record InsufficientData() implements IndicatorResult {

    @Override
    public GroupedIndicatorAvailability availability() {
      return GroupedIndicatorAvailability.INSUFFICIENT_DATA;
    }
  }
}
