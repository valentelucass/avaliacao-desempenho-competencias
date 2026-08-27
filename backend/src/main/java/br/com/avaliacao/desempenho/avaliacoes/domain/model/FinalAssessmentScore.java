package br.com.avaliacao.desempenho.avaliacoes.domain.model;

import java.math.BigDecimal;
import java.util.Objects;

/** Valor final válido, sem escolher precisão, arredondamento ou classificação. */
public record FinalAssessmentScore(BigDecimal value) {

  private static final BigDecimal MINIMUM = BigDecimal.valueOf(80);
  private static final BigDecimal MAXIMUM = BigDecimal.valueOf(120);

  public FinalAssessmentScore {
    Objects.requireNonNull(value, "nota final não pode ser nula");
    if (value.compareTo(MINIMUM) < 0 || value.compareTo(MAXIMUM) > 0) {
      throw new AssessmentRuleViolation("A nota final deve estar entre 80 e 120.");
    }
  }
}
