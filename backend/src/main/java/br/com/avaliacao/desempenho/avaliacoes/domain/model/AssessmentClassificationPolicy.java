package br.com.avaliacao.desempenho.avaliacoes.domain.model;

import java.math.BigDecimal;
import java.util.Objects;

/**
 * Aplica a matriz GERAL à nota final com uma casa decimal. A fórmula incompatível da aba ANÁLISE da
 * macro não participa desta política.
 */
public final class AssessmentClassificationPolicy {

  private static final BigDecimal REFERENCE_MINIMUM = BigDecimal.valueOf(115);
  private static final BigDecimal EXCEEDS_EXPECTATIONS_MINIMUM = BigDecimal.valueOf(105);
  private static final BigDecimal WITHIN_EXPECTATIONS_MINIMUM = BigDecimal.valueOf(95);
  private static final BigDecimal IN_DEVELOPMENT_MINIMUM = BigDecimal.valueOf(85);

  public PerformanceClassification classify(SimpleAverageScore average) {
    BigDecimal finalScore =
        Objects.requireNonNull(average, "média não pode ser nula").roundedToOneDecimal();
    new FinalAssessmentScore(finalScore);

    if (finalScore.compareTo(REFERENCE_MINIMUM) >= 0) {
      return PerformanceClassification.REFERENCE;
    }
    if (finalScore.compareTo(EXCEEDS_EXPECTATIONS_MINIMUM) >= 0) {
      return PerformanceClassification.EXCEEDS_EXPECTATIONS;
    }
    if (finalScore.compareTo(WITHIN_EXPECTATIONS_MINIMUM) >= 0) {
      return PerformanceClassification.WITHIN_EXPECTATIONS;
    }
    if (finalScore.compareTo(IN_DEVELOPMENT_MINIMUM) >= 0) {
      return PerformanceClassification.IN_DEVELOPMENT;
    }
    return PerformanceClassification.BELOW_EXPECTATIONS;
  }
}
