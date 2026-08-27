package br.com.avaliacao.desempenho.indicadores.domain.model;

import java.math.BigDecimal;
import java.util.Objects;

/** Percentual agregado de uma faixa, sempre sem contagem bruta. */
public record ClassificationPercentage(
    IndicatorClassification classification, BigDecimal percentage) {

  private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);
  private static final BigDecimal FIVE = BigDecimal.valueOf(5);

  public ClassificationPercentage {
    Objects.requireNonNull(classification, "classificação não pode ser nula");
    Objects.requireNonNull(percentage, "percentual não pode ser nulo");
    if (percentage.compareTo(BigDecimal.ZERO) < 0 || percentage.compareTo(HUNDRED) > 0) {
      throw new IllegalArgumentException("O percentual deve estar entre 0 e 100.");
    }
    if (percentage.remainder(FIVE).compareTo(BigDecimal.ZERO) != 0) {
      throw new IllegalArgumentException("O percentual deve ser múltiplo de cinco.");
    }
  }
}
