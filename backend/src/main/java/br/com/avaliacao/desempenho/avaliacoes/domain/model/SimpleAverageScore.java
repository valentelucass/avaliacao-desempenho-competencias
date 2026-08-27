package br.com.avaliacao.desempenho.avaliacoes.domain.model;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Collection;
import java.util.Objects;

/**
 * Média simples da regra 2024.1. A soma e a quantidade preservam a razão exata para auditoria; a
 * nota final é apresentada e persistida com uma casa decimal e arredondamento HALF_UP.
 */
public final class SimpleAverageScore {

  private final long totalPoints;
  private final int responseCount;

  private SimpleAverageScore(long totalPoints, int responseCount) {
    this.totalPoints = totalPoints;
    this.responseCount = responseCount;
  }

  public static SimpleAverageScore from(
      Collection<AssessmentScaleOption> responses, int expectedResponseCount) {
    Objects.requireNonNull(responses, "responses não pode ser nulo");

    if (expectedResponseCount < 1) {
      throw new AssessmentRuleViolation("A avaliação deve possuir ao menos uma pergunta.");
    }
    if (responses.size() != expectedResponseCount) {
      throw new AssessmentRuleViolation(
          "Uma avaliação final exige todas as respostas obrigatórias.");
    }

    long total = 0;
    for (AssessmentScaleOption response : responses) {
      if (response == null) {
        throw new AssessmentRuleViolation("A avaliação final não aceita resposta vazia.");
      }
      total = Math.addExact(total, response.points());
    }

    return new SimpleAverageScore(total, expectedResponseCount);
  }

  public boolean isAtLeast(int threshold) {
    return totalPoints >= Math.multiplyExact((long) threshold, responseCount);
  }

  public boolean isAtMost(int threshold) {
    return totalPoints <= Math.multiplyExact((long) threshold, responseCount);
  }

  public boolean isWithinInclusive(int lowerBound, int upperBound) {
    return isAtLeast(lowerBound) && isAtMost(upperBound);
  }

  public BigDecimal roundedToOneDecimal() {
    return BigDecimal.valueOf(totalPoints)
        .divide(BigDecimal.valueOf(responseCount), 1, RoundingMode.HALF_UP);
  }

  public long totalPoints() {
    return totalPoints;
  }

  public int responseCount() {
    return responseCount;
  }
}
