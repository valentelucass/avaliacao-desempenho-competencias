package br.com.avaliacao.desempenho.indicadores.domain.model;

import java.math.BigDecimal;
import java.util.EnumMap;
import java.util.Map;
import java.util.Objects;

/**
 * Resultado interno de uma consulta SQL agregada. A quantidade distinta só pode ser usada pela
 * política de privacidade e nunca é serializada para a API ou CSV.
 */
public sealed interface IndicatorAggregate
    permits IndicatorAggregate.AverageScore, IndicatorAggregate.ClassificationDistribution {

  int distinctCollaborators();

  record AverageScore(int distinctCollaborators, BigDecimal averageScore)
      implements IndicatorAggregate {

    public AverageScore {
      if (distinctCollaborators < 0) {
        throw new IllegalArgumentException("A quantidade distinta não pode ser negativa.");
      }
      Objects.requireNonNull(averageScore, "média não pode ser nula");
    }
  }

  record ClassificationDistribution(
      int distinctCollaborators, Map<IndicatorClassification, Integer> classificationCounts)
      implements IndicatorAggregate {

    public ClassificationDistribution {
      if (distinctCollaborators < 0) {
        throw new IllegalArgumentException("A quantidade distinta não pode ser negativa.");
      }
      Objects.requireNonNull(classificationCounts, "distribuição não pode ser nula");

      Map<IndicatorClassification, Integer> normalized =
          new EnumMap<>(IndicatorClassification.class);
      for (Map.Entry<IndicatorClassification, Integer> entry : classificationCounts.entrySet()) {
        IndicatorClassification classification =
            Objects.requireNonNull(entry.getKey(), "classificação não pode ser nula");
        Integer count = Objects.requireNonNull(entry.getValue(), "quantidade não pode ser nula");
        if (count < 0) {
          throw new IllegalArgumentException(
              "A quantidade por classificação não pode ser negativa.");
        }
        normalized.put(classification, count);
      }

      int total = normalized.values().stream().mapToInt(Integer::intValue).sum();
      if (total != distinctCollaborators) {
        throw new IllegalArgumentException(
            "A distribuição deve totalizar a quantidade de colaboradores distintos.");
      }
      classificationCounts = Map.copyOf(normalized);
    }
  }
}
