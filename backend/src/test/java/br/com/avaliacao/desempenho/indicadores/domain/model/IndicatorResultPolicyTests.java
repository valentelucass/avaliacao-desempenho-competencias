package br.com.avaliacao.desempenho.indicadores.domain.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.util.Map;
import org.junit.jupiter.api.Test;

class IndicatorResultPolicyTests {

  private final IndicatorResultPolicy policy = new IndicatorResultPolicy();

  @Test
  void suppressesTheAggregateWithoutExposingItsRawValuesBelowTheMinimum() {
    IndicatorResult result =
        policy.resultFor(
            IndicatorMetric.FINAL_SCORE_AVERAGE,
            new IndicatorAggregate.AverageScore(4, new BigDecimal("119.999")));

    assertThat(result).isInstanceOf(IndicatorResult.InsufficientData.class);
    assertThat(result.availability()).isEqualTo(GroupedIndicatorAvailability.INSUFFICIENT_DATA);
  }

  @Test
  void roundsTheAvailableScoreAverageToOneDecimalWithHalfUp() {
    IndicatorResult result =
        policy.resultFor(
            IndicatorMetric.COMPETENCY_SCORE_AVERAGE,
            new IndicatorAggregate.AverageScore(5, new BigDecimal("104.75")));

    assertThat(result).isInstanceOf(IndicatorResult.Available.class);
    IndicatorResult.Available available = (IndicatorResult.Available) result;
    assertThat(available.averageScore()).isEqualByComparingTo("104.8");
    assertThat(available.classificationDistribution()).isEmpty();
  }

  @Test
  void roundsEachClassificationPercentageToTheNearestMultipleOfFive() {
    IndicatorResult result =
        policy.resultFor(
            IndicatorMetric.CLASSIFICATION_DISTRIBUTION,
            new IndicatorAggregate.ClassificationDistribution(
                8,
                Map.of(
                    IndicatorClassification.BELOW_EXPECTATIONS,
                    1,
                    IndicatorClassification.IN_DEVELOPMENT,
                    7)));

    IndicatorResult.Available available = (IndicatorResult.Available) result;
    assertThat(available.averageScore()).isNull();
    assertThat(available.classificationDistribution())
        .extracting(ClassificationPercentage::classification, ClassificationPercentage::percentage)
        .containsExactly(
            org.assertj.core.groups.Tuple.tuple(
                IndicatorClassification.BELOW_EXPECTATIONS, new BigDecimal("15")),
            org.assertj.core.groups.Tuple.tuple(
                IndicatorClassification.IN_DEVELOPMENT, new BigDecimal("90")),
            org.assertj.core.groups.Tuple.tuple(
                IndicatorClassification.WITHIN_EXPECTATIONS, new BigDecimal("0")),
            org.assertj.core.groups.Tuple.tuple(
                IndicatorClassification.EXCEEDS_EXPECTATIONS, new BigDecimal("0")),
            org.assertj.core.groups.Tuple.tuple(
                IndicatorClassification.REFERENCE, new BigDecimal("0")));
    assertThat(
            available.classificationDistribution().stream()
                .map(ClassificationPercentage::percentage)
                .reduce(BigDecimal.ZERO, BigDecimal::add))
        .isEqualByComparingTo("105");
  }

  @Test
  void rejectsScoresOutsideTheApprovedRangeInsteadOfAdjustingThem() {
    assertThatThrownBy(
            () ->
                policy.resultFor(
                    IndicatorMetric.FINAL_SCORE_AVERAGE,
                    new IndicatorAggregate.AverageScore(5, new BigDecimal("120.001"))))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("entre 80 e 120");
  }
}
