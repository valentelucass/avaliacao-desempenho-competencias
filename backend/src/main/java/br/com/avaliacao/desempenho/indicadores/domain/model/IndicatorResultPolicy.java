package br.com.avaliacao.desempenho.indicadores.domain.model;

import java.math.BigDecimal;
import java.math.MathContext;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/** Transforma agregados internos em resultados que respeitam a privacidade v1. */
public final class IndicatorResultPolicy {

  private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

  private final GroupedIndicatorPrivacyPolicy privacyPolicy;
  private final IndicatorRoundingPolicy roundingPolicy;

  public IndicatorResultPolicy() {
    this(new GroupedIndicatorPrivacyPolicy(), new IndicatorRoundingPolicy());
  }

  public IndicatorResultPolicy(
      GroupedIndicatorPrivacyPolicy privacyPolicy, IndicatorRoundingPolicy roundingPolicy) {
    this.privacyPolicy =
        Objects.requireNonNull(privacyPolicy, "política de privacidade não pode ser nula");
    this.roundingPolicy =
        Objects.requireNonNull(roundingPolicy, "política de arredondamento não pode ser nula");
  }

  public IndicatorResult resultFor(IndicatorMetric metric, IndicatorAggregate aggregate) {
    IndicatorMetric requestedMetric = Objects.requireNonNull(metric, "métrica não pode ser nula");
    IndicatorAggregate internalAggregate =
        Objects.requireNonNull(aggregate, "agregado não pode ser nulo");

    if (privacyPolicy.availabilityFor(internalAggregate.distinctCollaborators())
        == GroupedIndicatorAvailability.INSUFFICIENT_DATA) {
      return new IndicatorResult.InsufficientData();
    }

    if (requestedMetric == IndicatorMetric.CLASSIFICATION_DISTRIBUTION) {
      return distributionResult(internalAggregate);
    }
    return averageResult(requestedMetric, internalAggregate);
  }

  private IndicatorResult distributionResult(IndicatorAggregate aggregate) {
    if (!(aggregate instanceof IndicatorAggregate.ClassificationDistribution distribution)) {
      throw new IllegalArgumentException(
          "A métrica de distribuição exige agregado por classificação.");
    }

    List<ClassificationPercentage> percentages = new ArrayList<>();
    for (IndicatorClassification classification : IndicatorClassification.values()) {
      int count = distribution.classificationCounts().getOrDefault(classification, 0);
      BigDecimal rawPercentage =
          BigDecimal.valueOf(count)
              .multiply(HUNDRED)
              .divide(
                  BigDecimal.valueOf(distribution.distinctCollaborators()), MathContext.DECIMAL128);
      percentages.add(
          new ClassificationPercentage(
              classification, roundingPolicy.roundPercentageToMultipleOfFive(rawPercentage)));
    }
    return new IndicatorResult.Available(
        IndicatorMetric.CLASSIFICATION_DISTRIBUTION, null, percentages);
  }

  private IndicatorResult averageResult(IndicatorMetric metric, IndicatorAggregate aggregate) {
    if (!(aggregate instanceof IndicatorAggregate.AverageScore average)) {
      throw new IllegalArgumentException("A métrica de média exige agregado de nota.");
    }
    return new IndicatorResult.Available(
        metric, roundingPolicy.roundAverageScore(average.averageScore()), List.of());
  }
}
