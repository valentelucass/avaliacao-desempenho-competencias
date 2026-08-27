package br.com.avaliacao.desempenho.indicadores.domain.model;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Objects;

/** Arredondamentos explicitamente aprovados para a resposta agregada v1. */
public final class IndicatorRoundingPolicy {

  private static final BigDecimal MINIMUM_SCORE = BigDecimal.valueOf(80);
  private static final BigDecimal MAXIMUM_SCORE = BigDecimal.valueOf(120);
  private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);
  private static final BigDecimal FIVE = BigDecimal.valueOf(5);

  public BigDecimal roundAverageScore(BigDecimal rawScore) {
    BigDecimal score = Objects.requireNonNull(rawScore, "média não pode ser nula");
    requireRange(score, MINIMUM_SCORE, MAXIMUM_SCORE, "A média de nota deve estar entre 80 e 120.");

    BigDecimal rounded = score.setScale(1, RoundingMode.HALF_UP);
    requireRange(
        rounded, MINIMUM_SCORE, MAXIMUM_SCORE, "A média arredondada deve estar entre 80 e 120.");
    return rounded;
  }

  public BigDecimal roundPercentageToMultipleOfFive(BigDecimal rawPercentage) {
    BigDecimal percentage = Objects.requireNonNull(rawPercentage, "percentual não pode ser nulo");
    requireRange(percentage, BigDecimal.ZERO, HUNDRED, "O percentual deve estar entre 0 e 100.");
    return percentage.divide(FIVE, 0, RoundingMode.HALF_UP).multiply(FIVE);
  }

  private void requireRange(
      BigDecimal value, BigDecimal minimum, BigDecimal maximum, String message) {
    if (value.compareTo(minimum) < 0 || value.compareTo(maximum) > 0) {
      throw new IllegalArgumentException(message);
    }
  }
}
